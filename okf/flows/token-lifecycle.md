---
type: Flow
title: pre provisions the App token, main uses it, post revokes it
description: The three-phase lifecycle that brackets every run; pre fails fast on missing permissions and post never fails the job.
x-okfit-entry: ../../src/pre.ts
x-okfit-crosses: [../../src/pre.ts, ../../src/layers/app.ts, ../../src/main.ts, ../../src/post.ts]
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [github, security]
sources:
  - id: pre
    resource: ../../src/pre.ts
  - id: post
    resource: ../../src/post.ts
  - id: layers
    resource: ../../src/layers/app.ts
x-okfit-integrity:
  generated:
    body: b36764d4261f6050
---

# Token lifecycle

1. **pre** saves the start time as `StartTimeState` through `ActionState`, reads `app-client-id` and `app-private-key` under exactly the names `action.yml` declares, takes the owner from `ActionEnvironment`, and calls `GitHubToken.provision({ appId, privateKey, owner, required: REQUIRED_PERMISSIONS })`.[^pre] Passing `owner` picks the right installation when the App is installed in several accounts. The config is not loaded here: `pre` runs before `actions/checkout`, so the file is not on disk yet.
2. **main** turns the persisted token back into an authenticated `GitHubClient` through `GitHubToken.clientLayer()` in `MainLive`, the only place that happens.[^layers] The rest is [the sync run](/flows/sync-run.md).
3. **post** logs total duration from the saved start time and calls `GitHubToken.dispose()` to revoke the token, even when `main` failed.[^post]

`REQUIRED_PERMISSIONS` is `administration: write` (labels and settings), `issues: write`, `organization_custom_properties: read` (discovery) and `organization_projects: write` (linking and backfill). The workflow itself needs only `contents: read`.

## Failure modes

- **Missing App permission:** `provision` fails in `pre` and the job stops before any sync work.
- **No persisted token in main:** the `orDie` on `clientLayer()` turns it into a defect; this happens when `pre` did not run. `act` skips `pre` for a local `./` action, so an `act` run fails here: that is the harness, not the build.
- **Revocation fails in post:** a warning; defects are swallowed so `post` never fails the job.

[^pre]: `src/pre.ts`
[^post]: `src/post.ts`
[^layers]: `src/layers/app.ts`
