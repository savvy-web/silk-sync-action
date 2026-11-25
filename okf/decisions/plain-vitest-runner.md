---
type: Decision
title: Keep the suite on plain vitest rather than @effect/vitest, for now
description: The port onto the kit moved the test doubles but not the runner, because converting both at once would have installed a virtual TestClock across the port's only characterization gate.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [testing]
sources:
  - id: vitest-config
    resource: ../../vitest.config.ts
x-okfit-integrity:
  generated:
    body: 4c692dd742d9a55f
---

# Plain vitest runner

## Context

When the action moved onto the `@effected` kit, the existing suite was the only evidence that observable behaviour had not changed.

## Decision

Keep plain vitest (`describe`, `it`, `expect`, `Effect.runPromise`) with v8 coverage and `pool: "forks"`.[^vitest-config] Convert the doubles to the kit's `layerTest` services, but not the runner. Converting `it.effect` at the same time would have put a virtual `TestClock` under every test while the thing under test was the port itself, so a failure could not be attributed to one change or the other.

This is a deferral, not a rejection: adopting `@effect/vitest` is queued in [the roadmap](/roadmaps/follow-ups.md).

## Alternatives rejected

- **Convert runner and doubles together:** two changes under one characterization gate.

[^vitest-config]: `vitest.config.ts`
