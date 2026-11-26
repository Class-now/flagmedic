// Creates the demo experiment the same way Flagsmith's official coding-agent setup prompt does
// (multivariate flag with a keyed variation -> metric -> experiment, not started).
// FlagMedic itself does not own experiment setup; this script only reproduces the starting point.
// Usage: FLAGSMITH_API_KEY=<org key> node scripts/setup-experiment.mjs [--start]
import { api, ENV_KEY, PROJECT_ID } from '../src/flagsmith.mjs';

const FLAG = process.env.FM_FLAG || 'pricing_cta';
const EVENT = process.env.FM_EVENT || 'cta_click';

async function findFeature() {
  const list = await api(`projects/${PROJECT_ID}/features/?search=${FLAG}`);
  return list.results.find((f) => f.name === FLAG);
}

let feature = await findFeature();
if (!feature) {
  feature = await api(`projects/${PROJECT_ID}/features/`, {
    method: 'POST',
    body: {
      name: FLAG,
      type: 'MULTIVARIATE',
      initial_value: 'control',
      default_enabled: true,
      description: 'Pricing page CTA copy A/B (control vs bold)',
    },
  });
  console.log('created feature', feature.id);
}
let options = await api(`projects/${PROJECT_ID}/features/${feature.id}/mv-options/`);
options = options.results ?? options;
let bold = options.find((o) => o.string_value === 'bold');
if (!bold) {
  bold = await api(`projects/${PROJECT_ID}/features/${feature.id}/mv-options/`, {
    method: 'POST',
    body: { type: 'unicode', string_value: 'bold', default_percentage_allocation: 0, key: 'bold', feature: feature.id },
  });
  console.log('created variation', bold.id);
}
console.log('variation', { id: bold.id, key: bold.key, value: bold.string_value });

let metrics = await api(`environments/${ENV_KEY}/experiment-metrics/`);
metrics = metrics.results ?? metrics;
let metric = metrics.find((m) => m.definition?.event === EVENT);
if (!metric) {
  metric = await api(`environments/${ENV_KEY}/experiment-metrics/`, {
    method: 'POST',
    body: { name: 'CTA click', aggregation: 'occurrence', direction: 'up', definition: { version: 1, event: EVENT } },
  });
  console.log('created metric', metric.id);
}

let exps = await api(`environments/${ENV_KEY}/experiments/`);
exps = exps.results ?? exps;
let exp = exps.find((e) => e.feature === feature.id || e.feature?.id === feature.id);
if (!exp) {
  exp = await api(`environments/${ENV_KEY}/experiments/`, {
    method: 'POST',
    body: {
      feature: feature.id,
      name: 'Pricing CTA copy',
      hypothesis: 'A bolder CTA ("Start building free") raises click-through on the pricing page',
      metrics: [{ metric: metric.id, expected_direction: 'increase' }],
      experiment_rollout: {
        enabled: true,
        rollout_percentage: 100,
        feature_state_value: { type: 'string', value: 'control' },
        multivariate_feature_state_values: [{ multivariate_feature_option: bold.id, percentage_allocation: 50 }],
      },
    },
  });
  console.log('created experiment', exp.id);
}
if (process.argv.includes('--start') && exp.status !== 'running') {
  exp = await api(`environments/${ENV_KEY}/experiments/${exp.id}/start/`, { method: 'POST' });
}
console.log(JSON.stringify({ feature: feature.id, variation: bold.id, metric: metric.id, experiment: exp.id, status: exp.status }, null, 2));
