---
type: Decision
title: Build on Effect v4 and the @effected kit, owning only domain logic
description: Three kit packages supply auth, the resilient typed GitHub client, state, outputs and logging, so the action ships no rate limiter, no octokit and no hand-wired platform layers.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [architecture, deps]
sources:
  - id: manifest
    resource: ../../package.json
  - id: layers
    resource: ../../src/layers/app.ts
x-okfit-integrity:
  generated:
    body: ea1a9ff184d66ed3
---

# Build on the effected kit

## Context

The action first hand-rolled everything against `@actions/*` and `@octokit/*`, then ran on `@savvy-web/github-action-effects@3`, which is now deprecated and removed; its `GitHubClientLive`, `GitHubGraphQL`, `ConfigLoader`, `ErrorAccumulator`, `Step.groupStep`, `GithubMarkdown` and `/testing` subpath have no equivalent in the kit.

## Decision

Depend on `@effected/github-actions` (`Action.run`, `ActionInput`, `ActionOutputs`, `ActionState`, `ActionEnvironment`, `ActionLogger`, `GitHubToken`, `GitHubMarkdown`), `@effected/github` (`GitHubClient`, `GitHubApp`, `GitHubRepository`, `GitHubIssue`, `Repo`/`RepoRef`, `GitHubError`) and `@effected/config-file` (`ConfigFile.read`, `JsonCodec`), plus `effect` and `@effect/platform-node`, all through `catalog:effected`.[^manifest] The action defines no services of its own.

## Why

- Resilience lives in `GitHubClient`: 429 and 5xx retry with backoff, so there is no rate-limit module and no inter-repo sleep here.
- App auth is three calls, `provision`, `clientLayer()` and `dispose`, instead of hand-managed Octokit auth and revocation.
- Cross-phase state is Schema-typed (`ActionState.save` and `getOptional`), not stringly-typed.
- `Action.run` composes `ActionRuntime.layer` itself, so the platform, HTTP client, logger and crypto services arrive free; the layer file is about ten lines.[^layers]
- Octokit is owned by `@effected/github`, so this repository has no direct `@actions/*` or `@octokit/*` dependency.

## Alternatives rejected

- **Staying on `github-action-effects@3`:** deprecated and removed upstream.
- **Back to raw `@actions/*` and `@octokit/*`:** re-owns retry, auth lifecycle and typing that the kit already tests.

[^manifest]: `package.json`
[^layers]: `src/layers/app.ts`
