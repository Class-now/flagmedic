#!/usr/bin/env node
// FlagMedic: watches a running Flagsmith experiment, catches broken measurement early, points at the line
// of code that causes it, and ships the winner + cleans up the flag only after a human approves.
//
//   flagmedic check  <flag> [--src <app dir>] [--sent <sender log>] [--no-refresh] [--json]
//   flagmedic watch  <flag> [--src <app dir>] [--every 5]          (re-checks every N minutes)
//   flagmedic proposals
//   flagmedic approve <id> --by <name> [--reason "..."]
//   flagmedic reject  <id> --by <name> [--reason "..."]
import { snapshot } from '../src/snapshot.mjs';
import { diagnose } from '../src/diagnose.mjs';
import { decide } from '../src/decide.mjs';
import { snippet } from '../src/source.mjs';
import * as queue from '../src/proposals.mjs';
import { experimentUrl, apiCalls, PROJECT_ID } from '../src/flagsmith.mjs';
import { cleanup } from '../src/cleanup.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const pos = argv.filter((a, i) => i > 0 && !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const flagSet = (n) => argv.includes(`--${n}`);

const C = (process.stdout.isTTY || process.env.FM_COLOR) && !process.env.NO_COLOR
  ? { red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m` }
  : { red: String, green: String, yellow: String, bold: String, dim: String };

function render(s, findings, d) {
  const out = [];
  const e = s.experiment;
  out.push(C.bold(`FlagMedic  ${s.flag}  -  experiment #${e.id} "${e.name}" (${e.status})`));
  out.push(C.dim(`${experimentUrl(e.id)}  |  ${s.at}${s.refreshNote ? `  |  ${s.refreshNote}` : ''}`));
  out.push('');
  if (findings.length) {
    out.push(C.red(C.bold(`HEALTH: ${findings.length} problem${findings.length > 1 ? 's' : ''} - do not read these results yet`)));
    for (const f of findings) {
      out.push(`  ${C.red(f.id)} ${C.bold(f.title)}`);
      out.push(`     ${f.detail}`);
      for (const c of f.causes) {
        out.push(`     ${C.yellow('cause')} ${c.file ? `${c.file}:${c.line}  ` : ''}${c.text}`);
        if (c.file) for (const l of snippet(s.files, c.file, c.line, 1)) out.push(C.dim(`        ${l.hit ? '>' : ' '} ${String(l.line).padStart(3)} | ${l.text}`));
      }
      out.push(`     ${C.green('fix')}   ${f.fix}`);
    }
  } else out.push(C.green(C.bold('HEALTH: OK')) + C.dim('  (warehouse, exposures per variation, conversions, sample ratio, delivery)'));
  out.push('');
  const tag = { SHIP: C.green, STOP: C.yellow, CONTINUE: C.dim, FIX: C.red }[d.verdict];
  out.push(`${C.bold('DECISION:')} ${tag(C.bold(d.verdict === 'SHIP' ? `SHIP ${d.winner}` : d.verdict))}  ${d.reason}`);
  if (d.rows) {
    out.push(C.dim(`   variation   identities  conversions   rate    chance to beat control (Flagsmith / FlagMedic)`));
    out.push(`   ${'control'.padEnd(11)} ${String(d.control.n).padStart(10)} ${String(d.control.conv).padStart(12)} ${(d.control.rate * 100).toFixed(1).padStart(6)}%`);
    for (const r of d.rows) out.push(`   ${r.variant.padEnd(11)} ${String(r.n).padStart(10)} ${String(r.conv).padStart(12)} ${(r.rate * 100).toFixed(1).padStart(6)}%   ${r.flagsmith != null ? (r.flagsmith * 100).toFixed(1) + '%' : '-'} / ${(r.own * 100).toFixed(1)}%`);
    out.push(C.dim(`   needed per arm: ${d.need}`));
  }
  return out.join('\n');
}

function propose(s, d) {
  if (d.verdict !== 'SHIP' && d.verdict !== 'STOP') return null;
  const e = s.experiment;
  const winner = d.verdict === 'SHIP' ? d.winner : 'control';
  const opt = e.feature.multivariate_options.find((o) => o.key === winner);
  const after = winner === 'control' ? { rollout_decision: 'control' } : { rollout_decision: 'variant', rollout_variant: opt.id };
  return queue.create({
    title: `Ship "${winner}" for ${s.flag} and clean up`,
    risk: 'high',
    rationale: d.reason,
    evidence: { experiment: e.id, url: experimentUrl(e.id), control: d.control, rows: d.rows, at: s.at },
    changes: [
      { op: 'complete_experiment', target: { experiment: e.id, flag: s.flag }, before: { status: e.status, serving: 'experiment split' }, after },
      ...(s.src ? [{ op: 'open_cleanup_pr', target: { flag: s.flag, src: s.src, project: PROJECT_ID, feature: e.feature.id }, before: { branches: 'control / variations' }, after: { hardcode: winner } }] : []),
    ],
  });
}

async function check({ quiet } = {}) {
  const flag = pos[0];
  if (!flag) throw new Error('usage: flagmedic check <flag> [--src dir]');
  const s = await snapshot(flag, { src: opt('src'), sentFile: opt('sent'), refresh: !flagSet('no-refresh') });
  const findings = diagnose(s);
  const d = decide(s.results, findings);
  const p = propose(s, d);
  if (flagSet('json')) console.log(JSON.stringify({ findings, decision: d, proposal: p?.id ?? null, api_calls: apiCalls }, null, 2));
  else {
    console.log(render(s, findings, d));
    if (p) console.log(`\n${C.bold('PROPOSAL')} ${p.id} (${p.status}, risk ${p.risk}): ${p.title}\n  ${C.dim(`approve: flagmedic approve ${p.id} --by <you> --reason "..."   reject: flagmedic reject ${p.id} --by <you>`)}`);
    if (!quiet) console.log(C.dim(`\n${apiCalls} Flagsmith API calls this check. Nothing was changed in Flagsmith.`));
  }
  return { findings, d };
}

function showProposal(p) {
  console.log(`${C.bold(p.id)}  ${p.status.toUpperCase()}  risk ${p.risk}  ${p.title}`);
  console.log(`   why: ${p.rationale}`);
  for (const c of p.changes) console.log(`   - ${c.op}  ${JSON.stringify(c.target)}\n       before ${JSON.stringify(c.before)}\n       after  ${JSON.stringify(c.after)}`);
  if (p.approved_by) console.log(`   ${p.status === 'rejected' ? 'rejected' : 'approved'} by ${p.approved_by} at ${p.approved_at}${p.reason ? ` - "${p.reason}"` : ''}`);
  for (const l of p.apply_log) console.log(`   ${l.ok ? C.green('ok  ') : C.red('FAIL')} ${l.op} ${l.ok ? JSON.stringify(l.result) : l.error}`);
}

try {
  if (cmd === 'check') await check();
  else if (cmd === 'watch') {
    const every = Number(opt('every', 5));
    for (;;) {
      await check({ quiet: true });
      console.log(C.dim(`\nnext check in ${every} min (Flagsmith allows one results refresh per 5 min)\n${'-'.repeat(60)}`));
      await new Promise((r) => setTimeout(r, every * 60000));
    }
  } else if (cmd === 'proposals') queue.list().forEach(showProposal);
  else if (cmd === 'approve') {
    const by = opt('by'); if (!by) throw new Error('--by <name> is required');
    const p = await queue.approve(pos[0], by, opt('reason'), { cleanup });
    showProposal(p);
  } else if (cmd === 'reject') {
    const by = opt('by'); if (!by) throw new Error('--by <name> is required');
    showProposal(queue.reject(pos[0], by, opt('reason')));
  } else {
    console.log('usage: flagmedic check|watch <flag> [--src dir] | proposals | approve <id> --by me --reason ".." | reject <id> --by me');
    process.exitCode = 2;
  }
} catch (e) {
  console.error(C.red(`error: ${e.message}`));
  process.exitCode = 1;
}
