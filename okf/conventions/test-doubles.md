---
type: Convention
title: Tests use each service's own layerTest, real inputs and a real filesystem
description: "Tests live in __test__/ mirroring src/, run on plain vitest, take doubles from each kit service's makeTest/layerTest, supply inputs through ActionInput.layer, and read config from a real temp file."
status: draft
stale_after: 2027-02-23T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [testing]
sources:
  - id: test-support
    resource: ../../__test__/test-support.ts
  - id: vitest-config
    resource: ../../vitest.config.ts
x-okfit-integrity:
  generated:
    body: 8abcbbfce8de14e6
---

# Test doubles

- Put every suite under `__test__/`, mirroring `src/` (`__test__/sync/labels.test.ts` covers `src/sync/labels.ts`). Never colocate; `src/` holds only shipped code.
- Write plain vitest (`describe`, `it`, `expect`, `Effect.runPromise`) on `pool: "forks"`, not `@effect/vitest` (see [the runner decision](/decisions/plain-vitest-runner.md)).
- Take doubles from the services themselves: `ActionOutputs.layerTest`, `ActionState.layerTest`, `ActionLogger.layerTest`, `ActionEnvironment.layerTest`, `GitHubApp.layerTest`. There is no `/testing` subpath. An unstubbed member dies naming itself, so a partial double proves a test touched nothing it did not stub.
- Use `githubTestLayer` for anything that talks to GitHub (see [the fixture](/fixtures/github-test-layer.md)).[^test-support]
- Supply inputs with `ActionInput.layer({ "input-name": "value" })`, never a bare `ConfigProvider` keyed by the plain name: `ActionInput` owns the `INPUT_` derivation, and a provider that skips it is a silent false green. `ActionInput.variable(name)` spells the runner variable for the one test that must.
- Exercise `ConfigFile.read` against a real temp file through `NodeFileSystem.layer`: the claim is about the filesystem, so a filesystem double would only test the double.

[^test-support]: `__test__/test-support.ts`
