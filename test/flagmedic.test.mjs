import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, checkZeroExposure, checkZeroConversion, checkSRM, checkFlush, checkWarehouse, configuredSplit } from '../src/diagnose.mjs';
import { decide } from '../src/decide.mjs';
import { srmPValue, minSamplePerArm, chanceToBeat } from '../src/stats.mjs';
import { rewrite } from '../src/cleanup.mjs';

const exp = (key = 'bold') => ({
  id: 1, name: 'x', status: 'running',
  feature: { id: 9, name: 'f', multivariate_options: [{ id: 7, key, string_value: 'bold' }] },
  experiment_rollout: { multivariate_feature_state_values: [{ multivariate_feature_option: 7, percentage_allocation: 50 }] },
});
const res = (c, b, srm = null) => ({ payload: { srm_p_value: srm, metrics: [{ metric_id: 5, variants: { control: { n: c[0], sum: c[1] }, bold: { n: b[0], sum: b[1] } }, inference: {} }] } });
const file = (rel, text) => ({ rel, lines: text.split('\n') });
const metrics = [{ id: 5, name: 'CTA click', definition: { event: 'cta_click' } }];

test('configured split gives control the remainder', () => {
  assert.deepEqual(configuredSplit(exp()), { bold: 0.5, control: 0.5 });
});

test('D1 fires when a variation records no exposures, and names the missing key', () => {
  const f = checkZeroExposure({ experiment: exp(null), results: res([300, 20], [0, 0]), files: [] });
  assert.equal(f.id, 'D1');
  assert.match(f.causes[0].text, /no key/);
});

test('D1 points at a client without enableEvents', () => {
  const files = [file('app.mjs', "new Flagsmith({ environmentKey: k })")];
  const f = checkZeroExposure({ experiment: exp(), results: res([300, 20], [0, 0]), files });
  assert.ok(f.causes.some((c) => /enableEvents/.test(c.text)));
});

test('D2 finds the near-miss event name and its line', () => {
  const files = [file('p.mjs', "a\nflagsmith.trackEvent('ctaClick', {})\nflagsmith.trackEvent('cta_click', {})")];
  const [f] = checkZeroConversion({ results: res([800, 70], [800, 0]), metrics, files });
  assert.equal(f.id, 'D2');
  assert.equal(f.causes.length, 1);
  assert.equal(f.causes[0].line, 2);
});

test('D2 stays quiet when every variation converts', () => {
  assert.equal(checkZeroConversion({ results: res([800, 70], [800, 90]), metrics, files: [] }).length, 0);
});

test('D3 detects sample ratio mismatch and the early return before the exposure', () => {
  const files = [file('p.mjs', [
    'export async function render(fs, id) {',
    "  const v = fs.getFeatureValue('f');",
    '  if (v === "bold") { if (!ok) return null; }',
    "  fs.trackExposureEvent('f', { identifier: id });",
    '}',
  ].join('\n'))];
  const f = checkSRM({ flag: 'f', experiment: exp(), results: res([1600, 100], [1350, 120]), files });
  assert.equal(f.id, 'D3');
  assert.ok(f.causes.some((c) => c.line === 3));
});

test('D3 does not fire on a fair split', () => {
  assert.equal(checkSRM({ flag: 'f', experiment: exp(), results: res([1000, 80], [1020, 120]), files: [] }), null);
});

test('D5 flags lost buffered events and a missing close()', () => {
  const f = checkFlush({ results: res([400, 1], [400, 1]), sent: { control: 1000, bold: 1000 }, files: [file('a.mjs', 'x')] });
  assert.equal(f.id, 'D5');
  assert.match(f.causes[0].text, /close/);
});

test('D6 flags a missing warehouse', () => {
  assert.equal(checkWarehouse({ warehouse: [], envKey: 'e' }).id, 'D6');
  assert.equal(checkWarehouse({ warehouse: [{ id: 1 }], envKey: 'e' }), null);
});

test('decision refuses to call a winner while measurement is broken', () => {
  assert.equal(decide(res([1000, 80], [1000, 140]), [{ severity: 'blocker' }]).verdict, 'FIX');
});

test('decision ships a clear winner, continues when under-powered, stops when flat', () => {
  assert.equal(decide(res([1000, 80], [1000, 125]), []).verdict, 'SHIP');
  assert.equal(decide(res([100, 8], [100, 14]), []).verdict, 'CONTINUE');
  assert.equal(decide(res([1000, 80], [1000, 81]), []).verdict, 'STOP');
});

test('stats helpers', () => {
  assert.ok(srmPValue([500, 500], [0.5, 0.5]) > 0.9);
  assert.ok(srmPValue([1600, 1350], [0.5, 0.5]) < 0.001);
  assert.equal(minSamplePerArm(0.08, 0.5), 901);
  assert.ok(chanceToBeat({ n: 1000, x: 80 }, { n: 1000, x: 130 }) > 0.99);
});

test('cleanup rewrite hard-codes the winner and drops the losing copy', () => {
  const src = [
    'const COPY = {',
    "  control: 'Get started',",
    "  bold: 'Start building free',",
    '};',
    'export async function renderPricing(flagsmith, userId) {',
    "  const flag = await flagsmith.getExperimentFlag('pricing_cta', userId);",
    "  const variant = flag.value === 'bold' ? 'bold' : 'control';",
    '  return { variant, cta: COPY[variant] };',
    '}',
  ];
  const r = rewrite(src, 'pricing_cta', 'bold', ['control']);
  assert.ok(!r.lines.some((l) => l.includes('getExperimentFlag')));
  assert.ok(r.lines.includes("  const variant = 'bold';"));
  assert.ok(!r.lines.some((l) => l.includes('Get started')));
  assert.equal(r.removed, 3);
});

test('diagnose returns nothing for a healthy experiment', () => {
  assert.equal(diagnose({ flag: 'f', experiment: exp(), results: res([1000, 80], [1000, 120]), metrics, warehouse: [{}], files: [] }).length, 0);
});
