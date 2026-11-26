// Approval queue. FlagMedic never changes Flagsmith directly: every change is a proposal that a human
// approves or rejects. Approved proposals are applied in order; the first failure stops the run.
import fs from 'node:fs';
import path from 'node:path';
import { api, ENV_KEY } from './flagsmith.mjs';

export const DIR = process.env.FM_HOME || path.resolve('.flagmedic');
const PDIR = () => path.join(DIR, 'proposals');
const AUDIT = () => path.join(DIR, 'AUDIT.md');

function ensure() {
  fs.mkdirSync(PDIR(), { recursive: true });
  if (!fs.existsSync(AUDIT())) fs.writeFileSync(AUDIT(), '# FlagMedic audit log\n\n| time (UTC) | proposal | who | action | detail |\n|---|---|---|---|---|\n');
}

export function audit(id, who, action, detail = '') {
  ensure();
  fs.appendFileSync(AUDIT(), `| ${new Date().toISOString()} | ${id} | ${who} | ${action} | ${String(detail).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |\n`);
}

export function list() {
  ensure();
  return fs.readdirSync(PDIR()).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(PDIR(), f), 'utf8')));
}
export function get(id) {
  const p = path.join(PDIR(), `${id}.json`);
  if (!fs.existsSync(p)) throw new Error(`no proposal ${id}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function save(p) { ensure(); fs.writeFileSync(path.join(PDIR(), `${p.id}.json`), JSON.stringify(p, null, 2) + '\n'); }

export function create({ title, changes, risk, rationale, evidence }) {
  const open = list().find((p) => p.status === 'pending' && p.title === title);
  if (open) return open; // don't queue the same proposal twice while watching
  const id = `p-${String(list().length + 1).padStart(4, '0')}`;
  const p = { id, created_at: new Date().toISOString(), author: 'flagmedic', title, status: 'pending', risk, rationale, evidence, changes, approved_by: null, approved_at: null, reason: null, apply_log: [] };
  save(p);
  audit(id, 'flagmedic', 'proposed', `${title} (risk ${risk})`);
  return p;
}

export function reject(id, who, reason = '') {
  const p = get(id);
  if (p.status !== 'pending') throw new Error(`${id} is ${p.status}, not pending`);
  Object.assign(p, { status: 'rejected', approved_by: who, approved_at: new Date().toISOString(), reason });
  save(p);
  audit(id, who, 'rejected', reason || 'no change made');
  return p;
}

const OPS = {
  async complete_experiment(c) {
    const body = { rollout_decision: c.after.rollout_decision };
    if (c.after.rollout_variant) body.rollout_variant = c.after.rollout_variant;
    return api(`environments/${ENV_KEY}/experiments/${c.target.experiment}/complete/`, { method: 'POST', body });
  },
  async delete_feature(c) {
    return api(`projects/${c.target.project}/features/${c.target.feature}/`, { method: 'DELETE' });
  },
  async open_cleanup_pr(c, ctx) {
    if (!ctx.cleanup) throw new Error('cleanup handler not available');
    return ctx.cleanup(c);
  },
};

export async function approve(id, who, reason, ctx = {}) {
  const p = get(id);
  if (p.status !== 'pending') throw new Error(`${id} is ${p.status}, not pending`);
  if (p.risk === 'high' && !reason) throw new Error(`${id} is high risk: give a one-line reason (--reason "...")`);
  Object.assign(p, { status: 'approved', approved_by: who, approved_at: new Date().toISOString(), reason: reason || null });
  save(p);
  audit(id, who, 'approved', reason || '');
  for (const c of p.changes) {
    try {
      const res = await OPS[c.op](c, ctx);
      p.apply_log.push({ op: c.op, ok: true, at: new Date().toISOString(), result: summarise(res) });
    } catch (e) {
      p.apply_log.push({ op: c.op, ok: false, at: new Date().toISOString(), error: e.message });
      p.status = 'failed';
      save(p);
      audit(id, 'flagmedic', 'failed', `${c.op}: ${e.message}`);
      return p;
    }
  }
  p.status = 'applied';
  save(p);
  audit(id, 'flagmedic', 'applied', p.changes.map((c) => c.op).join(', '));
  return p;
}

function summarise(res) {
  if (!res || typeof res !== 'object') return res ?? null;
  const { id, status, rollout_decision, rollout_variant, url, branch, removed, added } = res;
  return { id, status, rollout_decision, rollout_variant, url, branch, removed, added };
}
