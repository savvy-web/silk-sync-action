---
type: Decision
title: Repo is ambient and resolved per call, provided at exactly two sites
description: "Wrappers read yield* Repo instead of taking an (owner, repo) pair; syncRepo provides it for the per-repo chain and explicit discovery provides it per candidate."
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [architecture]
sources:
  - id: reads
    resource: ../../src/github/reads.ts
  - id: sync-repo
    resource: ../../src/sync/syncRepo.ts
  - id: explicit
    resource: ../../src/discovery/explicit.ts
x-okfit-integrity:
  generated:
    body: 74626737cebe59e0
---

# Ambient Repo

## Context

The sync chain makes a dozen calls against one repository. Threading `(owner, repo)` through every function invites passing the wrong pair.

## Decision

Every wrapper in `src/github/reads.ts` reads `yield* Repo` at call time, never captures it.[^reads] `Repo.provide(new RepoRef(...))` appears at exactly two sites:

- `src/sync/syncRepo.ts`, at the per-repository boundary, so the whole chain acts on that repository.[^sync-repo]
- `src/discovery/explicit.ts`, once per candidate name, because discovery validates repositories before any is ambient.[^explicit]

`Repo` is never provided as a layer. `syncLabels` and `syncProject` still take `owner` and `repo` strings, but only for log and result text; their API calls resolve `Repo`. A third `Repo.provide` site is a design change, not a convenience.

## Alternatives rejected

- **Explicit `(owner, repo)` arguments:** the threading this removes.
- **`Repo` as a layer:** one repository for the whole run, which discovery and the per-repo loop cannot use.

[^reads]: `src/github/reads.ts`
[^sync-repo]: `src/sync/syncRepo.ts`
[^explicit]: `src/discovery/explicit.ts`
