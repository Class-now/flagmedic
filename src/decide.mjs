// Turns healthy results into one of three words: SHIP, STOP or CONTINUE.
import { chanceToBeat, minSamplePerArm } from './stats.mjs';

export const POLICY = { baseRate: 0.08, minLift: 0.5, win: 0.95, flatLow: 0.2, flatHigh: 0.8 };

export function decide(results, findings, policy = POLICY) {
  if (findings.some((f) => f.severity === 'blocker'))
    return { verdict: 'FIX', reason: 'Measurement is broken; results are not trustworthy until the findings above are fixed.' };
  const m = results?.payload?.metrics?.[0];
  if (!m?.variants?.control) return { verdict: 'CONTINUE', reason: 'No results yet.' };
  const need = minSamplePerArm(policy.baseRate, policy.minLift);
  const c = m.variants.control;
  const arms = Object.entries(m.variants).filter(([k]) => k !== 'control');
  const rows = arms.map(([k, v]) => {
    const own = chanceToBeat({ n: c.n, x: c.sum }, { n: v.n, x: v.sum });
    const fsChance = m.inference?.[k]?.chance_to_win;
    return { variant: k, n: v.n, conv: v.sum, rate: v.n ? v.sum / v.n : 0, chance: fsChance ?? own, own, flagsmith: fsChance ?? null, lift: m.inference?.[k]?.lift ?? null };
  });
  const minN = Math.min(c.n, ...rows.map((r) => r.n));
  const control = { variant: 'control', n: c.n, conv: c.sum, rate: c.n ? c.sum / c.n : 0 };
  const best = rows.reduce((a, b) => (b.chance > a.chance ? b : a), rows[0]);
  if (minN < need) return { verdict: 'CONTINUE', reason: `Smallest arm has ${minN} of the ${need} identities needed to detect a ${policy.minLift * 100}% lift.`, need, control, rows };
  if (best.chance >= policy.win) return { verdict: 'SHIP', winner: best.variant, reason: `${best.variant} beats control with ${(best.chance * 100).toFixed(1)}% probability (n = ${best.n} vs ${c.n}).`, need, control, rows };
  if (rows.every((r) => r.chance < 1 - policy.win)) return { verdict: 'SHIP', winner: 'control', reason: 'Every variation loses to control.', need, control, rows };
  if (rows.every((r) => r.chance >= policy.flatLow && r.chance <= policy.flatHigh)) return { verdict: 'STOP', reason: 'Enough data and no meaningful difference; end the experiment and keep control.', need, control, rows };
  return { verdict: 'CONTINUE', reason: `Leader ${best.variant} at ${(best.chance * 100).toFixed(1)}%, below the ${policy.win * 100}% bar.`, need, control, rows };
}
