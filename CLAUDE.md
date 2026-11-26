# FlagMedic

Entry for the Toggle Wars hackathon (Flagsmith × WeMakeDevs, Track 02). Deadline 2026-11-29 14:30 UTC.

- What it is: README.md.
- Layout: `bin/flagmedic.mjs` (CLI) → `src/snapshot.mjs` (Flagsmith Admin API) → `src/diagnose.mjs` (D1–D6) → `src/decide.mjs` → `src/proposals.mjs` (approval queue, audit log) → `src/cleanup.mjs` (cleanup PR). Demo app `demo/app`, broken variants `demo/faults/*`, traffic `scripts/simulate.mjs`.
- Resume: `npm test`, then `node bin/flagmedic.mjs check pricing_cta --src demo/app` with the env vars in README "Run it".
- Contest state, plan and next steps live in the contest-pm repo: `contests/1129-toggle-wars/status.md`.
- Never commit the organisation API key or the server-side key. The client-side environment key is public.
