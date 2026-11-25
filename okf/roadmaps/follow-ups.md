---
type: Roadmap
title: Queued follow-ups from the kit port, and candidate sync capabilities
description: Adopt @effect/vitest, decide whether to isolate build:prod from test edits, and a list of unscheduled capability ideas.
x-okfit-gate: none scheduled; each item is picked up on its own
status: draft
stale_after: 2027-02-23T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [testing, ci]
x-okfit-integrity:
  generated:
    body: 5b72501c5b199172
---

# Follow-ups

## Queued

- **Adopt `@effect/vitest`.** The port moved the doubles, not the runner, on purpose (see [the runner decision](/decisions/plain-vitest-runner.md)). Remaining: convert suites to `it.effect`, and check every time-dependent path under the virtual `TestClock`.
- **Decide whether to isolate `build:prod` from test edits.** It needs a `src`-only typecheck gating `build:prod` beside the full one (see [the measurement](/measurements/test-edit-cache-miss.md)). Worth it only if bundle rebuilds become a real cost.

## Candidate capabilities, not scheduled

- Branch protection and ruleset synchronization
- Repository security settings (vulnerability alerts, secret scanning)
- A drift-detection, audit-only reporting mode
- Configuration inheritance (a base plus per-repository overrides)
- Multi-org runs
