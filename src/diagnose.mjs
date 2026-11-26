// Health checks for a running Flagsmith experiment. Pure functions over a snapshot, so they are unit-testable.
// A snapshot is built by watch.mjs from the Flagsmith Admin API plus (optionally) the app's source and the
// sender's own counts. Every check returns null (healthy / not applicable) or a finding.
import { srmPValue, levenshtein } from './stats.mjs';
import { trackedEvents, exposureSites, earlyExitsBefore, grep } from './source.mjs';

export const SRM_ALPHA = 0.001;

/** Variant keys and their configured weights (0..1). Control gets the remainder. */
export function configuredSplit(experiment) {
  const opts = experiment.feature?.multivariate_options ?? [];
  const alloc = experiment.experiment_rollout?.multivariate_feature_state_values ?? [];
  const split = {};
  let used = 0;
  for (const a of alloc) {
    const o = opts.find((x) => x.id === a.multivariate_feature_option);
    const key = o?.key || `<no key: option ${a.multivariate_feature_option}>`;
    split[key] = a.percentage_allocation / 100;
    used += a.percentage_allocation;
  }
  split.control = (100 - used) / 100;
  return split;
}

export function exposuresByVariant(results) {
  const metric = results?.payload?.metrics?.[0];
  if (metric?.variants) return Object.fromEntries(Object.entries(metric.variants).map(([k, v]) => [k, v.n]));
  const pts = results?.payload?.exposures_timeseries?.points ?? [];
  const out = {};
  for (const p of pts) for (const [k, v] of Object.entries(p.new_identities ?? {})) out[k] = (out[k] ?? 0) + v;
  return out;
}

// D6: no warehouse -> nothing can be measured.
export function checkWarehouse(s) {
  if (s.warehouse && s.warehouse.length === 0)
    return { id: 'D6', title: 'No warehouse connected', severity: 'blocker',
      detail: `GET environments/${s.envKey}/warehouse-connections/ is empty, so exposures and conversions are never stored.`,
      fix: 'Connect a warehouse (Environment settings > Warehouse) before starting the experiment.', causes: [] };
  return null;
}

// D1: a variant records no exposures while the others do.
export function checkZeroExposure(s) {
  const split = configuredSplit(s.experiment);
  const n = exposuresByVariant(s.results);
  const total = Object.values(n).reduce((a, b) => a + b, 0);
  const dead = Object.keys(split).filter((k) => split[k] > 0 && (n[k] ?? 0) === 0);
  if (!dead.length || total < 20) return null;
  const causes = [];
  for (const k of dead) if (k.startsWith('<no key')) causes.push({ text: `variation ${k} has no key; Flagsmith records no exposures for an unkeyed variation` });
  if (s.files?.length && !grep(s.files, /enableEvents\s*:\s*true/).length)
    causes.push({ text: 'no SDK client is initialised with enableEvents: true' });
  return { id: 'D1', title: `No exposures for ${dead.join(', ')}`, severity: 'blocker',
    detail: `${total} exposures recorded, ${dead.map((k) => `${k}: 0`).join(', ')} (configured ${dead.map((k) => `${Math.round(split[k] * 100)}%`).join(', ')}).`,
    fix: 'Give every variation a key and initialise the SDK with enableEvents: true.', causes };
}

// D2: exposures arrive but a metric records no conversions for one or more variants.
export function checkZeroConversion(s, minN = 100) {
  const findings = [];
  for (const m of s.results?.payload?.metrics ?? []) {
    const def = s.metrics?.find((x) => x.id === m.metric_id);
    const zero = Object.entries(m.variants ?? {}).filter(([, v]) => v.n >= minN && v.sum === 0).map(([k]) => k);
    if (!zero.length) continue;
    const want = def?.definition?.event;
    const causes = [];
    if (want && s.files?.length) {
      for (const t of trackedEvents(s.files)) {
        if (t.event === want) continue;
        const norm = (x) => x.toLowerCase().replace(/[_\-\s]/g, '');
        if (norm(t.event) === norm(want) || levenshtein(t.event, want) <= 3)
          causes.push({ file: t.file, line: t.line, text: `sends "${t.event}" but metric "${def.name}" counts "${want}" (event names are case-sensitive)`, code: t.text });
      }
    }
    findings.push({ id: 'D2', title: `No conversions for ${zero.join(', ')} on metric "${def?.name ?? m.metric_id}"`, severity: 'blocker',
      detail: zero.map((k) => `${k}: ${m.variants[k].n} exposed, 0 converted`).join('; ') + (want ? `. Metric event: "${want}".` : '.'),
      fix: want ? `Send exactly "${want}" with the same identifier as the exposure.` : 'Check the event name and identifier.', causes });
  }
  return findings;
}

// D3: sample ratio mismatch. Uses Flagsmith's own srm_p_value when present, otherwise a chi-square test.
export function checkSRM(s) {
  const split = configuredSplit(s.experiment);
  const n = exposuresByVariant(s.results);
  const keys = Object.keys(split);
  const observed = keys.map((k) => n[k] ?? 0);
  const total = observed.reduce((a, b) => a + b, 0);
  if (total < 200 || observed.some((o) => o === 0)) return null; // zero arms are D1
  const fs = s.results?.payload?.srm_p_value;
  const p = typeof fs === 'number' ? fs : srmPValue(observed, keys.map((k) => split[k]));
  if (p === null || p >= SRM_ALPHA) return null;
  const short = keys.filter((k, i) => observed[i] < total * split[k]);
  const causes = [];
  for (const site of exposureSites(s.files ?? [], s.flag))
    for (const e of earlyExitsBefore(s.files, site))
      causes.push({ file: e.file, line: e.line, text: `exits before the exposure on ${site.file}:${site.line} is recorded, so some visitors are never counted`, code: e.text });
  return { id: 'D3', title: `Sample ratio mismatch (p = ${p.toExponential(1)})`, severity: 'blocker',
    detail: `Configured ${keys.map((k) => `${k} ${Math.round(split[k] * 100)}%`).join(' / ')}, observed ${keys.map((k, i) => `${k} ${observed[i]} (${((observed[i] / total) * 100).toFixed(1)}%)`).join(' / ')}. ${short.join(', ')} is under-counted. ${typeof fs === 'number' ? 'p-value from Flagsmith results.' : 'p-value from FlagMedic chi-square.'}`,
    fix: 'Record the exposure where the variation is decided, before any branch that can leave early.', causes };
}

// D5: the sender says it sent more exposures than Flagsmith received (buffered events lost on exit).
export function checkFlush(s) {
  if (!s.sent) return null;
  const n = exposuresByVariant(s.results);
  const got = Object.values(n).reduce((a, b) => a + b, 0);
  const sent = Object.values(s.sent).reduce((a, b) => a + b, 0);
  if (!sent || got / sent >= 0.9) return null;
  const causes = [];
  if (s.files?.length && !grep(s.files, /\b(flushEvents|close)\(\s*\)/).length)
    causes.push({ text: 'no flushEvents()/close() call found; buffered events are dropped when the process exits' });
  return { id: 'D5', title: `Only ${Math.round((got / sent) * 100)}% of exposures arrived`, severity: 'warning',
    detail: `Sender rendered ${sent} variations, Flagsmith has ${got} exposures.`, fix: 'Await close() (Node) or flushEvents() (JS) before exit.', causes };
}

export function diagnose(s) {
  const out = [checkWarehouse(s), checkZeroExposure(s), ...checkZeroConversion(s), checkSRM(s), checkFlush(s)].filter(Boolean);
  return out;
}
