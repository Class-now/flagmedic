// Simulated traffic for the demo app. This is synthetic traffic, and the README says so.
// Usage: FLAGSMITH_SERVER_KEY=<server-side env key> node scripts/simulate.mjs [--app demo/app] [--users 1600] [--prefix run1]
// Conversion rates baked in: control 8%, bold 12%.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const appDir = path.resolve(arg('app', 'demo/app'));
const users = Number(arg('users', 1600));
const prefix = arg('prefix', `sim-${Date.now().toString(36)}`);
const rate = { control: Number(arg('control-rate', 0.08)), bold: Number(arg('bold-rate', 0.12)) };

const app = await import(pathToFileURL(path.join(appDir, 'pricing.mjs')).href);
const flagsmith = app.createClient();

// Deterministic PRNG so runs are reproducible.
let seed = [...prefix].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const seen = { control: 0, bold: 0 };
const clicked = { control: 0, bold: 0 };
const concurrency = 20;
let next = 0;
async function worker() {
  while (next < users) {
    const uid = `${prefix}-u${String(next++).padStart(5, '0')}`;
    const page = await app.renderPricing(flagsmith, uid);
    if (!page) continue; // visitor left before the CTA rendered
    seen[page.variant]++;
    if (rand() < rate[page.variant]) {
      app.onCtaClick(flagsmith, uid, page.variant);
      clicked[page.variant]++;
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
await flagsmith.close();
const out = { prefix, app: path.relative(process.cwd(), appDir), users, rendered: seen, clicked, sent_at: new Date().toISOString() };
console.log(JSON.stringify(out));
