// Scenes of the 3-minute demo video. Terminal text comes from real runs captured into video/cap/.
// `cmd` is the command shown above the captured output; `file` is the captured output.
export const VOICE = 'en-US-AndrewNeural';

export const scenes = [
  {
    id: '01-title',
    slide: {
      title: 'FlagMedic',
      sub: 'An agent that watches running Flagsmith experiments',
      bullets: [
        'catches broken measurement on the first results refresh',
        'points at the line of code that causes it',
        'ships the winner and removes the flag only after a human approves',
      ],
      foot: 'Toggle Wars  ·  Track 02: AI Agents and Feature Flags  ·  github.com/Class-now/flagmedic',
    },
    say: "This is FlagMedic, my entry for Track two, AI Agents and Feature Flags. It watches a running Flagsmith experiment, catches broken measurement on the first results refresh, points at the line of code that causes it, and ships the winner and removes the flag only after a human approves.",
  },
  {
    id: '02-problem',
    slide: {
      title: 'Starting an experiment is solved. Trusting it is not.',
      bullets: [
        "Flagsmith's coding-agent setup prompt gets you to a running experiment in minutes",
        'A typo in an event name: one variation shows zero conversions',
        'An early return before the exposure: the 50/50 split is no longer 50/50',
        'After the decision, the flag and the losing branch stay in the code for months',
      ],
      foot: 'FlagMedic takes over where the setup prompt ends',
    },
    say: "Flagsmith's official setup prompt already takes you from an idea to a running experiment in minutes. The part that goes wrong comes after. A typo in an event name, and one variation shows zero conversions. An early return before the exposure is recorded, and your fifty fifty split quietly isn't fifty fifty any more. And once someone decides, the flag and the losing branch stay in the code for months. FlagMedic takes over exactly where the setup prompt ends.",
  },
  {
    id: '03-setup',
    file: 'setup.txt',
    say: "Here is the starting point. This script reproduces the last steps of the setup prompt on Flagsmith Cloud: a multivariate flag with a keyed variation, a metric, and a running experiment, number five nine seven. Then two thousand visitors go through a small pricing page. To be clear, the traffic is simulated. The experiments are real.",
  },
  {
    id: '04-d2',
    cmd: 'flagmedic check trial_cta --src demo/faults/event-name',
    file: 'd2.txt',
    say: "First, a broken app. FlagMedic refreshes the results, reads the experiment, the metric and the warehouse connection, and then reads the app's source. The bold variation has eight hundred and eleven exposures and zero conversions. The metric counts cta underscore click, but line twenty six sends camel case ctaClick. FlagMedic shows that line, says how to fix it, and refuses to name a winner. The decision is FIX.",
  },
  {
    id: '05-d3',
    cmd: 'flagmedic check hero_cta --src demo/faults/srm --sent runs/srm.jsonl',
    file: 'd3.txt',
    say: "A harder one. The split was configured fifty fifty, but bold got only forty five point six percent of visitors. The chi square p value is one point six times ten to the minus six. The cause is line thirty one: the page returns before the exposure on line thirty three is recorded, so some bold visitors are never counted. When we ran this, Flagsmith's results reported bold at a ninety nine point eight percent chance to win, while its own SRM value was still empty. Shipping on that number would have shipped a measurement bug.",
  },
  {
    id: '06-ship',
    cmd: 'flagmedic check plan_cta --src demo/app --sent runs/video1.jsonl',
    file: 'ship.txt',
    say: "Now the healthy experiment. All five health checks pass. Every arm has more than the nine hundred and one identities the plan needs, and bold beats control with ninety eight point nine percent probability. FlagMedic shows Flagsmith's number next to its own Beta posterior, so you can see they agree. The decision is SHIP bold. But FlagMedic changes nothing. It queues a proposal with the evidence and the exact changes.",
  },
  {
    id: '07-reject',
    cmd: 'flagmedic reject p-0001 --by shotaro --reason "I want to see the split first"',
    file: 'reject.txt',
    say: "A human can say no. Rejecting a proposal changes nothing in Flagsmith or in the repository. It is just written to the audit log, with who rejected it and why.",
  },
  {
    id: '08-approve',
    cmd: 'flagmedic approve p-0002 --by shotaro --reason "bold wins at 98.9%, past the planned sample"',
    file: 'approve.txt',
    say: "After the next check, I approve. High risk proposals need a reason. The changes apply in order and stop at the first failure. First, Flagsmith's complete endpoint ends experiment five nine seven and serves bold to everyone. Second, FlagMedic opens a cleanup pull request.",
  },
  {
    id: '09-pr',
    cmd: 'gh pr diff 2   # opened by FlagMedic',
    file: 'prdiff.txt',
    say: "This is the pull request it opened. The flag read is gone, the losing copy is gone, and the winner is hard coded. Deleting the flag in Flagsmith is a separate, later proposal, because deleting it before this merges would send live traffic to the flag's default value.",
  },
  {
    id: '10-audit',
    cmd: 'cat .flagmedic/AUDIT.md',
    file: 'audit.txt',
    say: "Every proposal, rejection, approval and applied change is in one audit file, so you can always answer who shipped what, and why.",
  },
  {
    id: '11-numbers',
    slide: {
      title: 'Numbers from these runs',
      bullets: [
        'Broken metric caught on the first results refresh after traffic',
        '6 Flagsmith API calls per check, no LLM in the loop: a check costs nothing',
        '0 changes without a human approval',
        'Flagsmith used: Experimentation REST API, metrics, warehouse connection, complete endpoint, Node SDK',
      ],
      foot: 'github.com/Class-now/flagmedic   ·   traffic in the demo is simulated; the experiments run on Flagsmith Cloud',
    },
    say: "To sum up. A broken metric is caught on the first results refresh after traffic. A check costs six Flagsmith API calls and no language model calls. And nothing changes without a human approval. FlagMedic uses Flagsmith's experimentation API, metrics, the warehouse connection, the complete endpoint and the Node SDK. The code is on GitHub. Thanks for watching.",
  },
];
