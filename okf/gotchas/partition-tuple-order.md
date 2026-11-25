---
type: Gotcha
title: A reversed Effect.partition destructure compiles and silently returns no results
description: "Since effect 4.0.0 partition returns [passes, fails]; writing [fails, passes] still type-checks because never[] is assignable to the result type, and the run reports zero repositories."
resource: ../../src/sync/processRepos.ts
status: draft
stale_after: 2027-02-23T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [compat, testing]
sources:
  - id: process-repos
    resource: ../../src/sync/processRepos.ts
  - id: process-repos-test
    resource: ../../__test__/sync/processRepos.test.ts
  - id: program-test
    resource: ../../__test__/program.test.ts
x-okfit-integrity:
  generated:
    body: 8d997f4ba7b947eb
---

# Partition tuple order

**What you see:** `processRepos` compiles, the action runs, and the summary reports no repositories synced, with no error anywhere.

**What you conclude:** discovery found nothing, or every repository was skipped.

**What is true:** `Effect.partition` returns `[passes, fails]` since `effect@4.0.0`; the release candidates returned `[fails, passes]`. `syncRepo`'s error channel is `never`, so the fails half is `never[]`, which is assignable to the results type. A destructure written the old way still type-checks and binds the empty half.[^process-repos] The code reads `const [results] = …`.

The compiler will not catch this. `__test__/sync/processRepos.test.ts` and `__test__/program.test.ts` do, by asserting the results are non-empty.[^process-repos-test] [^program-test] Keep those assertions.

[^process-repos]: `src/sync/processRepos.ts`
[^process-repos-test]: `__test__/sync/processRepos.test.ts`
[^program-test]: `__test__/program.test.ts`
