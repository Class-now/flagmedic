# FlagMedic

**An agent that watches a running Flagsmith experiment, catches broken measurement in the first refresh, points at the line of code that causes it, and ships the winner and removes the flag only after a human approves.**

Toggle Wars (Flagsmith × WeMakeDevs), **Track 02: AI Agents and Feature Flags**.

**Demo video (3:56):** https://github.com/Class-now/flagmedic/releases/download/v1.0-demo/flagmedic-demo.mp4 — every terminal screen in it is real output from Flagsmith Cloud (experiments #558, #559, #597), rebuilt with `node video/build.mjs`.

Flagsmith's official coding-agent prompt already takes you from an idea to a *started* experiment in minutes. FlagMedic takes over from there: the part where experiments quietly go wrong, and the part nobody does afterwards.

```
FlagMedic  trial_cta  -  experiment #558 "Pricing CTA copy" (running)

HEALTH: 1 problem - do not read these results yet
  D2 No conversions for bold on metric "CTA click"
     bold: 811 exposed, 0 converted. Metric event: "cta_click".
     cause pricing.mjs:26  sends "ctaClick" but metric "CTA click" counts "cta_click" (event names are case-sensitive)
        >  26 |     flagsmith.trackEvent('ctaClick', { identifier: userId });
     fix   Send exactly "cta_click" with the same identifier as the exposure.

DECISION: FIX  Measurement is broken; results are not trustworthy until the findings above are fixed.
```

## Track 02 at a glance

| Track 02 asks for | Where FlagMedic does it |
|---|---|
| Flagsmith CLI, API or MCP server | The Experimentation REST API end to end: read results, refresh, complete the experiment ([Use of Flagsmith](#use-of-flagsmith)). It does not use the MCP server because the server cannot start experiments (Flagsmith docs, "Set Up an Experiment with a Coding Agent"). |
| Saves real time | A broken metric or a skewed split shows up on the first results refresh, with the file and line, instead of after days of misleading numbers ([Numbers](#numbers-from-the-demo-runs-in-this-repo-synthetic-traffic)). |
| A human approves changes | Every write (complete the experiment, open the cleanup PR) is a proposal with evidence. A person approves or rejects it, and `.flagmedic/AUDIT.md` logs every step ([A human approves every change](#a-human-approves-every-change)). |
| Clear output | One screen per check: `HEALTH`, the line of code that causes the problem, and a one-word decision: `FIX`, `SHIP`, `STOP` or `CONTINUE` ([The decision](#the-decision)). |

## Numbers (from the demo runs in this repo, synthetic traffic)

| | |
|---|---|
| Time to catch a broken metric | **first results refresh after traffic** (under 1 minute after 1,600 visitors; Flagsmith allows one refresh per 5 minutes) |
| Flagsmith API calls per check | **6** (experiment, refresh, results, metrics, warehouse) — no LLM in the loop, so a check costs nothing |
| Changes made without approval | **0** — every write to Flagsmith or your repo is a proposal a human approves or rejects |

Why it matters, from the SRM demo (`hero_cta`, experiment #559): the results API reported **bold at a 99.8% chance to win** while `srm_p_value` was still `null`. The split was 45.6% / 54.4% against a configured 50/50 (χ² p = 1.6e-6) because the bold variation recorded its exposure only after a lazily-loaded banner rendered. Shipping on that number would have shipped a measurement bug. FlagMedic answered `FIX` and pointed at the line:

```
  D3 Sample ratio mismatch (p = 1.6e-6)
     Configured bold 50% / control 50%, observed bold 1361 (45.6%) / control 1623 (54.4%). bold is under-counted.
     cause pricing.mjs:31  exits before the exposure on pricing.mjs:33 is recorded, so some visitors are never counted
        >  31 |     if (!rendered) return null;
```

Weakness, stated up front: all traffic in the demo is simulated by `scripts/simulate.mjs` (1,600–2,000 visitors per scenario, conversion 8% vs 12%). The experiments themselves are real experiments on Flagsmith Cloud.

## Use of Flagsmith

| Flagsmith piece | What FlagMedic does with it |
|---|---|
| Experimentation REST API (`experiments/`, `results/refresh/`, `results/`) | Reads per-variation identities, conversions, `chance_to_win` and `srm_p_value` every check |
| `experiment-metrics/` | Reads each metric's event name to match it against the `trackEvent` calls in your code (D2) |
| `warehouse-connections/` | Blocks the verdict when no warehouse is connected (D6) |
| `experiments/<id>/complete/` | After approval, ends the experiment and serves the winning variation to everyone |
| Node SDK `@flagsmith/nodejs` 9.5 (`getExperimentFlag`, `trackExposureEvent`, `trackEvent`, `close`) | The demo app and traffic simulator |
| Feature + multivariate option + metric + experiment creation | `scripts/setup-experiment.mjs` reproduces the official setup prompt's steps 4–6, so the demo starts where that prompt ends |

## The health checks

A check never reports a winner while any blocker is open. That rule is the point of the tool.

| ID | Catches | Rule | Where it looks in your code |
|---|---|---|---|
| D1 | A variation records no exposures | 0 exposures for a variation with weight > 0, others ≥ 20 | Variation without a key; no client with `enableEvents: true` |
| D2 | Conversions not counted | A variation with ≥ 100 identities and 0 conversions | `trackEvent('<name>')` calls whose name is a near-miss of the metric's event (case/underscore, edit distance ≤ 3) |
| D3 | Sample ratio mismatch | χ² goodness-of-fit p < 0.001 (Flagsmith's `srm_p_value` when it is computed) | Early `return`/`throw` between reading the flag and recording the exposure |
| D5 | Buffered events lost on exit | Flagsmith has < 90% of the exposures the sender rendered | No `close()` / `flushEvents()` |
| D6 | Nothing can be stored | No warehouse connection | Settings, not code |

## The decision

When the experiment is healthy, FlagMedic says one of three words:

- **SHIP &lt;variation&gt;** — every arm has at least the planned sample (901 per arm to detect a 50% relative lift on an 8% baseline, Lehr's rule) and the variation beats control with ≥ 95% probability.
- **STOP** — enough data, chance to win between 20% and 80%: end it and keep control.
- **CONTINUE** — with how many identities are still missing.

It shows Flagsmith's `chance_to_win` next to its own Beta-posterior estimate, so you can see they agree.

## A human approves every change

```
PROPOSAL p-0001 (pending, risk high): Ship "bold" for plan_cta and clean up
  approve: flagmedic approve p-0001 --by <you> --reason "..."   reject: flagmedic reject p-0001 --by <you>
```

- A SHIP verdict queues a proposal (`.flagmedic/proposals/p-0001.json`) with the evidence and the exact changes: complete the experiment serving the winner, then open a cleanup pull request.
- High-risk proposals need a one-line reason. Rejecting changes nothing.
- Changes apply in order and stop at the first failure.
- Every proposal, approval, rejection and application is appended to `.flagmedic/AUDIT.md`.
- The cleanup PR removes the flag read and the losing branch and copy, leaving the winner hard-coded. Deleting the flag in Flagsmith is a separate, later proposal: deleting it before the PR merges would drop live traffic to the flag's default.

## Run it

```bash
npm install
export FLAGSMITH_API_KEY=...            # organisation API key (Admin API)
export FLAGSMITH_SERVER_KEY=ser....      # server-side environment key (SDK)
export FLAGSMITH_ENVIRONMENT_KEY=...     # environment key used in Admin API paths
export FLAGSMITH_PROJECT_ID=...

node scripts/setup-experiment.mjs --start                     # flag + keyed variation + metric + experiment
node scripts/simulate.mjs --app demo/app --users 2000         # synthetic visitors
node bin/flagmedic.mjs check plan_cta --src demo/app       # health + decision (+ proposal)
node bin/flagmedic.mjs watch plan_cta --src demo/app       # every 5 minutes
node bin/flagmedic.mjs proposals
node bin/flagmedic.mjs approve p-0001 --by alice --reason "bold wins at 98.9%"
npm test
```

Broken-on-purpose versions of the demo app: `demo/faults/event-name` (D2) and `demo/faults/srm` (D3).

## Status

Built during the Toggle Wars window (2026-11-26 to 2026-11-29).

End-to-end run recorded in the video: experiment #597 (`plan_cta`, 1,036 vs 964 identities, bold 12.2% vs control 8.4%, 98.9% chance to beat control) was checked, the first proposal rejected, the second approved; FlagMedic completed the experiment serving `bold` and opened cleanup PR [#2](https://github.com/Class-now/flagmedic/pull/2) (3 lines removed, 1 added). An earlier run did the same for `pricing_cta` (#556, PR [#1](https://github.com/Class-now/flagmedic/pull/1)).
