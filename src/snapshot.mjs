// Collects everything the checks need from the Flagsmith Admin API (and the app source, if given).
import fs from 'node:fs';
import { api, ENV_KEY } from './flagsmith.mjs';
import { loadSource } from './source.mjs';

const page = (r) => r?.results ?? r ?? [];

export async function findExperiment(flag) {
  const exps = page(await api(`environments/${ENV_KEY}/experiments/?search=${encodeURIComponent(flag)}`));
  const mine = exps.filter((e) => (e.feature?.name ?? e.feature_name) === flag || e.name === flag);
  const pick = mine.find((e) => e.status === 'running') ?? mine.sort((a, b) => b.id - a.id)[0] ?? exps[0];
  if (!pick) throw new Error(`no experiment found for flag "${flag}"`);
  return api(`environments/${ENV_KEY}/experiments/${pick.id}/`);
}

export async function snapshot(flag, { src, sentFile, refresh = true } = {}) {
  const experiment = await findExperiment(flag);
  const base = `environments/${ENV_KEY}/experiments/${experiment.id}`;
  let refreshNote = null;
  if (refresh && experiment.status === 'running') {
    try { await api(`${base}/results/refresh/`, { method: 'POST' }); refreshNote = 'refreshed'; }
    catch (e) { refreshNote = e.status === 429 ? 'refresh rate-limited (once per 5 min); using last results' : `refresh failed: ${e.message}`; }
    await new Promise((r) => setTimeout(r, 4000));
  }
  const [resultsWrap, metrics, warehouse] = await Promise.all([
    api(`${base}/results/`),
    api(`environments/${ENV_KEY}/experiment-metrics/`).then(page),
    api(`environments/${ENV_KEY}/warehouse-connections/`).then(page),
  ]);
  const results = resultsWrap?.results ?? resultsWrap;
  let sent = null;
  if (sentFile && fs.existsSync(sentFile)) {
    sent = {};
    for (const line of fs.readFileSync(sentFile, 'utf8').split(/\r?\n/).filter(Boolean)) {
      const r = JSON.parse(line);
      for (const [k, v] of Object.entries(r.rendered ?? {})) sent[k] = (sent[k] ?? 0) + v;
    }
  }
  return { flag, envKey: ENV_KEY, experiment, results, metrics, warehouse, sent, files: loadSource(src), src, refreshNote, at: new Date().toISOString() };
}
