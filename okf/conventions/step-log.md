---
type: Convention
title: Two phases, one step per unit of work, and never a step inside a group
description: "program.ts opens the Discovery and Sync phases with ActionLogger.phase, each unit of work is one ActionLogger.step, and steps are never wrapped in logger.group."
status: draft
stale_after: 2027-02-23T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [observability, testing]
sources:
  - id: program
    resource: ../../src/program.ts
  - id: process-repos
    resource: ../../src/sync/processRepos.ts
x-okfit-integrity:
  generated:
    body: 0babf871b0f7daa1
---

# Step log

- Open exactly two phases in `program.ts`: **Discovery** (steps `Discover repositories`, then `Resolve projects` only when a repository tracks a project) and **Sync**.[^program]
- Give each repository its own `logger.step` in `processRepos`.[^process-repos] A step folds its detail on success and unfolds it on failure.
- Never wrap a step in `logger.group`: a step opened inside a group cannot fold.
- Fail a repository's step with `RepoSyncFailure` when its result records errors, then recover straight back into the result so the error channel stays `never`.
- An unresolved project logs one warning, which marks `Resolve projects` with `⚠`.
- Test the log with `ActionLogger.recording()` and assert on its `StepLogEntry` values, not on rendered text.
- Do not reach for `withStep`, `withBuffer` or `heading`: they were removed in `@effected/github-actions@0.36.0`.

[^program]: `src/program.ts`
[^process-repos]: `src/sync/processRepos.ts`
