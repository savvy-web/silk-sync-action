---
type: Module
title: silk-sync-action is a three-phase node24 GitHub Action
description: The one shipped unit, bundled by effected action build into dist/pre.js, dist/main.js and dist/post.js and declared by action.yml.
x-okfit-kind: action
resource: ../../action.yml
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [architecture, github]
sources:
  - id: action-manifest
    resource: ../../action.yml
  - id: build-config
    resource: ../../effected.toml
  - id: layers
    resource: ../../src/layers/app.ts
x-okfit-integrity:
  generated:
    body: 06a25a8e466e071f
---

# silk-sync-action

`action.yml` declares `runs.using: node24` with `pre: dist/pre.js`, `main: dist/main.js` and `post: dist/post.js`.[^action-manifest] Each entry (`src/pre.ts`, `src/main.ts`, `src/post.ts`) is a thin shell guarded on `GITHUB_ACTIONS` that calls `Action.run(program, { layer })`. The phase sequence is [the token lifecycle flow](/flows/token-lifecycle.md); the body of `main` is [the sync run flow](/flows/sync-run.md).

## Layout

`src/` holds only shipped code; tests mirror it under `__test__/`.

| Path | Owns |
| --- | --- |
| `src/pre.ts`, `src/main.ts`, `src/post.ts` | phase entrypoints; `REQUIRED_PERMISSIONS` lives in `pre.ts` |
| `src/program.ts` | the main Effect program: discover, sync, report, outputs |
| `src/layers/app.ts` | `PreLive`, `MainLive`, `PostLive` |
| `src/inputs.ts` | `SilkInputs` from `ActionInput` |
| `src/schemas.ts` | `SilkConfig`, domain types, `ResultsOutput` |
| `src/errors.ts` | `DiscoveryError`, `InvalidInputError` |
| `src/state.ts` | `StartTimeState` for cross-phase state |
| `src/github/reads.ts` | route-keyed `GitHubClient` wrappers over the ambient `Repo` |
| `src/discovery/` | custom-property and explicit discovery, union and dedupe |
| `src/sync/` | `processRepos`, `syncRepo`, labels, settings, projects |
| `src/reporting/` | `aggregateStats` and the step-summary markdown |
| `lib/scripts/schemastore.config.ts` | derives `silk.config.schema.json` from `SilkConfig` |

## Layers

The wiring is about ten lines.[^layers] `PreLive` and `PostLive` are `GitHubApp.layer`, which signs the App JWT through core's `Signature` service; `Action.run` supplies that, along with the platform, HTTP client and workflow-command logger, through `ActionRuntime.layer`. `MainLive` is `GitHubToken.clientLayer()` piped through `Layer.orDie`, plus `GitHubRepository.layer` and `GitHubIssue.layer` over that client. The `orDie` is required: `Action.run` takes a layer whose error channel is `never`, and a missing or expired persisted token is a failure of `pre`, not something `main` can recover.

## Build

`effected action build`, configured by the `[action]` table of `effected.toml`, validates `action.yml`, bundles each entry with rolldown (`minify = true`) and imports each bundle in a fresh Node to prove it loads.[^build-config] `dist/` is committed. Turbo orders `types:check`, then `schema:build`, then `build:prod`. Current sizes are in [the bundle measurement](/measurements/bundle-size.md).

[^action-manifest]: `action.yml`
[^build-config]: `effected.toml`
[^layers]: `src/layers/app.ts`
