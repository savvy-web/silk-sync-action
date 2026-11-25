---
type: Decision
title: Per-repository failures are recorded in results, never fatal, via Effect.partition
description: "syncRepo's error channel is never; every operation's failure becomes a SyncErrorRecord, and processRepos collects results with Effect.partition since the kit ships no ErrorAccumulator."
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [architecture, observability]
sources:
  - id: process-repos
    resource: ../../src/sync/processRepos.ts
  - id: sync-repo
    resource: ../../src/sync/syncRepo.ts
x-okfit-integrity:
  generated:
    body: a5edba96b20dbe53
---

# Per-repository accumulation

## Context

One bad repository (a missing permission, an org policy, a closed project) must not stop the rest of the fleet from syncing, and every failure must still be visible in the results.

## Decision

`syncRepo` captures the repository fetch, labels, settings and project work into `SyncErrorRecord[]`; `syncSettings` and `syncProject` return their failures alongside their status fields (a rejected PATCH, an unresolved project, a missing node ID, a failed link, issue listing or item add), and `syncRepo` folds them into the repository's `errors`.[^sync-repo] So `success: errors.length === 0` reflects every operation, and the error channel is `never` by contract.

`processRepos` runs repositories sequentially through `Effect.partition`, which runs every effect and never fails.[^process-repos] Because the error channel is `never`, the failure half is statically empty and the code destructures `const [results] = …`. The kit ships no `ErrorAccumulator` successor on purpose. Each repository is one `ActionLogger.step`; one whose result records errors fails its step with `RepoSyncFailure`, showing `✗` and its first error, and is recovered straight back into its result.

Only three errors are fatal to the run: `InvalidInputError`, `ConfigReadError` and `DiscoveryError` (see [the sync run](/flows/sync-run.md)).

The tuple order is a trap: see [the partition gotcha](/gotchas/partition-tuple-order.md).

## Alternatives rejected

- **Fail fast:** one repository's problem blocks the fleet.
- **A hand-rolled accumulator:** reimplements what `Effect.partition` already does.

[^process-repos]: `src/sync/processRepos.ts`
[^sync-repo]: `src/sync/syncRepo.ts`
