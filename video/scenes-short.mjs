// Under-3-minute cut of scenes.mjs (WeMakeDevs asks for a demo video under 3 minutes). Same screens, shorter narration.
import { scenes as full, VOICE } from './scenes.mjs';
export { VOICE };
export const RATE = '+12%';
const say = {
  "01-title": "This is FlagMedic, for Track two, AI Agents and Feature Flags. It watches a running Flagsmith experiment, catches broken measurement on the first refresh, points at the line of code that causes it, and ships the winner only after a human approves.",
  "02-problem": "Flagsmith's setup prompt gets you to a running experiment in minutes. What goes wrong comes after. A typo in an event name, and one variation shows zero conversions. An early return before the exposure, and fifty fifty isn't fifty fifty any more. And the losing branch stays in the code for months.",
  "03-setup": "This script finishes the setup on Flagsmith Cloud: a multivariate flag, a metric, and running experiment five nine seven. Then two thousand simulated visitors go through a pricing page. The traffic is simulated; the experiments are real.",
  "04-d2": "First, a broken app. Bold has eight hundred and eleven exposures and zero conversions. The metric counts cta underscore click, but line twenty six sends camel case ctaClick. FlagMedic shows the line, says how to fix it, and refuses to name a winner. The decision is FIX.",
  "05-d3": "A harder one. The split is fifty fifty, but bold got only forty five point six percent. The SRM p value is one point six times ten to the minus six. Line thirty one returns before the exposure is recorded. Flagsmith's results still said bold had a ninety nine point eight percent chance to win. Shipping that would have shipped a bug.",
  "06-ship": "Now the healthy experiment. All health checks pass, every arm has the sample it needs, and bold beats control at ninety eight point nine percent, matching FlagMedic's own Beta posterior. The decision is SHIP bold. But FlagMedic changes nothing yet. It queues a proposal with the evidence.",
  "07-reject": "A human can say no. A rejection changes nothing, and goes to the audit log with who and why.",
  "08-approve": "Then I approve, with a reason. Flagsmith's complete endpoint ends the experiment and serves bold to everyone, and FlagMedic opens a cleanup pull request.",
  "09-pr": "The flag read and the losing copy are gone. Deleting the flag itself is a later proposal, after this merges.",
  "10-audit": "Every proposal, rejection and change is in one audit file.",
  "11-numbers": "To sum up. Broken metrics caught on the first refresh. Six Flagsmith API calls per check, no language model. Nothing changes without a human. The code is on GitHub. Thanks for watching."
};
export const scenes = full.map((s) => ({ ...s, say: say[s.id] }));
