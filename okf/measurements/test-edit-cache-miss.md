---
type: Measurement
title: A test-file edit still invalidates the build:prod cache
description: Moving tests from src/ to __test__/ did not isolate the bundle from test edits, because build:prod depends on types:check, which must cover __test__.
status: draft
stale_after: 2027-02-23T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [ci, performance, testing]
sources:
  - id: turbo
    resource: ../../turbo.json
x-okfit-integrity:
  generated:
    body: fb007a569d587f41
---

# Test edit cache miss

**Question:** does keeping tests in `__test__/` stop a test edit from rebuilding the bundle?

**Method:** with a warm cache, append a line to `__test__/sync/labels.test.ts` and run `build:prod`. Recorded during the move onto the kit (2026-08); the exact date was not kept.

**Result:** `build:prod` went from `2 cached, 2 total >>> FULL TURBO` to `0 cached, 2 total`. No isolation.

**Why, from `turbo.json`:**[^turbo]

1. `build:prod`'s `inputs` include `$TURBO_DEFAULT$`, which already covers every non-ignored file in the package. Extra or narrower globs beside it cannot subtract anything.
2. `build:prod` `dependsOn` `types:check`, and `types:check` must cover `__test__` or tests stop being typechecked. A dependency's hash feeds the dependent's, so a test edit invalidates `build:prod` whatever its own inputs say.

**What it rules out:** narrowing `build:prod`'s inputs. Isolation needs a task-graph change, a `src`-only typecheck gating `build:prod` beside a full one, at the cost of a second `tsc` run. A cold `build:prod` is under two seconds, so this is not worth doing yet; it is queued in [the roadmap](/roadmaps/follow-ups.md).

[^turbo]: `turbo.json`
