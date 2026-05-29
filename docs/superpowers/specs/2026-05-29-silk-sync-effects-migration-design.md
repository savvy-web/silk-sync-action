# Spec: Idiomatic Effect rewrite of `silk-sync-action` → 1.0.0

**Date:** 2026-05-29
**Status:** Approved design — ready for implementation planning
**Branch:** `dev`

## Goal

Rewrite `@savvy-web/silk-sync-action` in the idiomatic Effect style on top of
`@savvy-web/github-action-effects` (v2.x), deleting all hand-rolled
infrastructure that the library now provides, then cut a stable **1.0.0** so
consumers can pin `@v1`.

The action's *behavior* is preserved (discover org repos, sync labels +
settings + Projects v2 linking/backfill, report results), but its
infrastructure is re-expressed on library primitives and its public contract is
modernized (we are free to make breaking input/output changes for 1.0.0).

## Non-goals

- No change to the discovery semantics, sync ordering, or the `silk.config.json`
  schema shape.
- No new sync capabilities (no new settings, no new label semantics).
- No change to the `silk.config.schema.json` generation step.

## Dependencies on the library

- **Blocking-ish:** [savvy-web/github-action-effects#139][issue-139] — make
  `403 + Retry-After` retryable in `GitHubClient` resilience. silk-sync drops
  its hand-rolled inter-request throttling in favor of library resilience, so
  robust secondary-rate-limit handling is what makes that safe. Land + release
  this (via local `pnpm link`, then a library release) before or alongside 1.0.0.
- **Optional / later:** [savvy-web/github-action-effects#140][issue-140] — a
  typed custom-properties helper. 1.0.0 ships with the raw `octokit.request`
  form for the typing-gap endpoint; adopt the helper in a later minor.

[issue-139]: https://github.com/savvy-web/github-action-effects/issues/139
[issue-140]: https://github.com/savvy-web/github-action-effects/issues/140

---

## 1. Architecture & phase model

Keep the **three-phase** structure, re-expressed entirely on library primitives.
Each phase is its own `Action.run(...)` entrypoint (the library handles runtime
setup, error catching, `::error::` emission, and exit codes). The real `main`
logic lives in `src/program.ts` so tests import it directly, matching the sister
actions.

| Phase | File | Responsibility |
| --- | --- | --- |
| `pre` | `src/pre.ts` | `GitHubToken.provision({ permissions })` — mint installation token, verify required scopes, persist via `ActionState`, record App identity. Save `startedAt` timing state. |
| `main` | `src/main.ts` | Thin wrapper: `Action.run(program, { layer: MainLive })`, where `MainLive` includes `GitHubToken.client()`. |
| `post` | `src/post.ts` | Log total duration from saved timing; `GitHubToken.dispose()` (best-effort revoke). |

`action.yml` remains `using: node24` with `pre`/`main`/`post` pointing at
`dist/pre.js`, `dist/main.js`, `dist/post.js`.

## 2. Target directory layout

```text
src/
  pre.ts            # Action.run(pre,     { layer: PreLive })
  main.ts           # Action.run(program, { layer: MainLive })
  post.ts           # Action.run(post,    { layer: PostLive })
  program.ts        # main Effect program: discover → sync → report → outputs
  inputs.ts         # Config/ActionInput parsing → SilkInputs struct
  layers/
    app.ts          # PreLive, MainLive, PostLive composition
  errors/           # Schema.TaggedError per failure mode
  schemas/          # SilkConfig, DiscoveredRepo, ProjectInfo, RepoSyncResult,
                    #   ResultsOutput, ActionState structs
  discovery/        # discoverRepos (custom properties ∪ explicit list, dedupe)
  sync/
    labels.ts
    settings.ts
    projects.ts
    syncRepo.ts     # per-repo orchestration (labels → settings → projects)
  reporting/        # step summary via ReportBuilder/GithubMarkdown
lib/scripts/
  generate-schema.ts   # unchanged — still emits silk.config.schema.json
silk.config.schema.json
```

Conventions follow the migrated sister actions: `PascalCase` service files where
services are introduced, `Schema.TaggedError` errors in `errors/`, domain types
in `schemas/`, layer composition in `layers/app.ts`, `.test.ts` colocated.

## 3. Infrastructure deletions (replaced by the library)

| Current hand-rolled module | Replaced by |
| --- | --- |
| `lib/github/auth.ts` (createAppAuth, install lookup, revoke) | `GitHubToken.provision` / `GitHubToken.dispose` |
| `lib/services/rest.ts`, `graphql.ts`, `types.ts` tags | `GitHubClient` (`rest`/`paginate`/`graphql`) + `GitHubGraphQL` |
| `lib/rate-limit/throttle.ts` (manual delays + rate checks) | `GitHubClient` built-in resilience (see #139) |
| `lib/config/load.ts` (`node:fs` + `ArrayFormatter`) | `ConfigLoader.loadJson(path, SilkConfig)` |
| `lib/logging.ts`, all `@actions/core` calls | Effect `Logger` + `ActionLogger` (`group`, `withBuffer`) + `Step` |
| `lib/inputs.ts` raw `core.getInput` parsing | `Config.*` + `ActionInput.boolean` / `ActionInput.multiline` |
| state via `core.saveState` / `core.getState` + `JSON.parse` | `ActionState.save` / `get` with Schema structs |
| `core.setOutput` | `ActionOutputs.set` / `setJson` / `summary` |

**Net dependency change:** `@actions/core`, `@actions/github`, `@octokit/rest`,
`@octokit/auth-app`, `@octokit/request` all drop from `dependencies`. Remaining
runtime deps: `effect`, `@effect/platform`, `@effect/platform-node`,
`@savvy-web/github-action-effects` (matching `silk-router-action`). Effect
packages move to `catalog:silk` refs.

## 4. Public contract redesign

### Inputs

| Input | Change | Notes |
| --- | --- | --- |
| `app-id` | **renamed → `app-client-id`** | matches `GitHubToken.provision` defaults; GitHub App client ID |
| `app-private-key` | kept | PEM, redacted |
| `config-file` | kept | default `.github/silk.config.json` |
| `custom-properties` | kept | multiline `key=value`, AND logic |
| `repos` | kept | multiline explicit repo list |
| `dry-run` | kept | default `false` |
| `remove-custom-labels` | kept | default `false` |
| `sync-settings` | kept | default `true` |
| `sync-projects` | kept | default `true` |
| `skip-backfill` | kept | default `false` |
| `log-level` | **dropped** | redundant: `Effect.logDebug` emits `::debug::`, gated by the runner's `ACTIONS_STEP_DEBUG` / `RUNNER_DEBUG` |
| `skip-token-revoke` | **dropped** | `GitHubToken.dispose` is the post step; tokens auto-expire |

Boolean inputs are parsed with `ActionInput.boolean` (YAML 1.2 core schema),
multiline inputs with `ActionInput.multiline`. `custom-properties` keeps its
bespoke `key=value` parse (comment/blank-line stripping) on top of the multiline
split. The "at least one discovery method must be configured" validation is
preserved.

### Outputs

- `results` — kept, emitted via `ActionOutputs.setJson("results", …, ResultsOutput)`
  validated against a new `ResultsOutput` schema. Same JSON shape as today
  (`success`, `dryRun`, `repos`, `labels`, `settings`, `projects`, `errors`).
- **New scalar convenience outputs** (sister-action convention, for `if:`
  conditions without `fromJSON`): `success`, `repos-total`, `repos-succeeded`,
  `repos-failed`.

### Required token permissions (verified in `pre` via `provision`)

`GitHubToken.provision({ permissions })` verifies the minted token's scopes
before persisting. Declare the scopes silk-sync needs and confirm exact
fine-grained names during implementation:

- Repository **Administration: write** — `repos.update` settings sync.
- Repository **Issues: write** — label CRUD (labels live under the Issues API).
- Organization **custom properties** read (or org **Metadata** read) — discovery.
- Organization/repository **Projects: write** — Projects v2 linking + item adds.

If a scope is missing, `provision` revokes the token and fails fast in `pre`.

## 5. Domain logic (preserved behavior, re-expressed)

### Discovery (`discovery/`)

Behavior unchanged:

- **Custom properties:** read org repo property values via `GitHubClient.paginate`
  over the raw `GET /orgs/{org}/properties/values` endpoint (the documented
  octokit typing gap — keep the explicit `octokit.request` annotation until #140
  lands). AND-match the configured `key=value` pairs.
- **Explicit list:** resolve each configured repo name.
- **Merge:** union, dedupe by `fullName` (case-insensitive); on conflict, org
  discovery's custom properties win.
- Fail with a `Discovery`-tagged error if zero repos are discovered.

### Per-repo sync (`sync/`)

- **Sequential** processing via `ErrorAccumulator.forEachAccumulate`, preserving
  per-repo error accumulation (one repo's failure never halts the run) and
  current log readability/ordering.
- Per repo, in order: **labels → settings → projects**, exactly as today.
- **Labels** (`labels.ts`): create/update/remove/unchanged against config
  defaults; `remove-custom-labels` controls removal of non-config labels; report
  per-label `LabelResult` + `customLabels`.
- **Settings** (`settings.ts`): diff config settings against the fetched repo,
  apply via `repos.update`; report `SettingChange[]` + `applied`. Skipped when
  `sync-settings=false`.
- **Projects** (`projects.ts`): gated on `sync-projects` and the repo's
  `project-tracking=true` + `project-number` custom properties.
  - Resolve unique project numbers **once** into an in-memory cache (closed
    projects are cached as skip-with-reason).
  - Link repo to project via `GitHubGraphQL`; backfill open issues/PRs (paginated)
    unless `skip-backfill=true`.
  - "Already linked" / "item already exists" detection moves from the old typed
    `isAlreadyExists` flags to inspecting `GitHubClientError` /
    `GitHubGraphQLError` reasons. **Implementation risk to nail down carefully**
    — add focused tests around the GraphQL "already exists" mutation responses.

### State structs (`schemas/`)

`ActionState` structs replace ad-hoc `JSON.parse(getState(...))`:

- timing: `{ startedAt: number }`
- installation token + identity: handled by `GitHubToken` internally.

## 6. Reporting (`reporting/`)

- **Step summary** rebuilt with `ReportBuilder` + `GithubMarkdown` (tables)
  instead of the hand-rolled `summary.ts` string building.
- **Console output** via the Effect logger and `Step` groups
  (`ActionLogger.group` / `Step.withStep`) instead of `core.info` with manual
  separators.

## 7. Error model (`errors/`)

`Schema.TaggedError` subclasses with computed `get message()`, following the
sister-action pattern. Expected domain failures (e.g. `DiscoveryError`,
`InvalidInputError`, config-invalid) are typed; library calls surface
`GitHubClientError` / `GitHubGraphQLError` / `ConfigLoaderError` /
`TokenPermissionError` etc. The top-level program catches and routes to
`ActionOutputs.setFailed` (the old `core.setFailed("… failed: …")` shape), while
per-repo errors are accumulated into the results rather than failing the run.

## 8. Testing

- Vitest per-module, using library **Test layers**: `GitHubClientTest`,
  `GitHubGraphQLTest`, `ActionOutputsTest`, `ActionStateTest`, `ActionLoggerTest`,
  `ConfigLoaderTest`, `ActionEnvironmentTest`.
- Inputs supplied via `ConfigProvider.fromMap` + `Effect.withConfigProvider`.
- `program.ts` gets broad program-level tests against mock layers (discovery →
  sync → outputs), asserting recorded outputs/state.
- Preserve current coverage posture (≥80% across library modules).
- Mock-layer helpers live in a `test-helpers.ts` analogous to today's.

## 9. Build / release / 1.0.0

- Build pipeline unchanged: `github-action-builder build` (via turbo),
  `generate:schema`, `validate`. Output remains `dist/{pre,main,post}.js`.
- Bump deps: `@savvy-web/github-action-effects ^2.0.1` (or newer once #139 ships),
  Effect packages → `catalog:silk`.
- Development per repo convention: work on `dev`, `pnpm build`, push, test live
  from a consumer repo pointed at `@dev`. If the library needs changes (#139),
  edit it locally, `pnpm build` there, `pnpm link` its `dist/npm`, iterate; then
  release the library, **unlink**, and only then PR silk-sync into `main`.
- Merge `dev` → `main` triggers the release flow; cut **1.0.0** so the
  `release-sync.yml` flow creates the `v1` alias tag for `@v1` pinning.

## 10. Open items to confirm during implementation

1. Exact fine-grained permission names for `provision({ permissions })` (§4).
2. Reliable "already exists" detection from GraphQL error shapes (§5 projects).
3. Whether `ResultsOutput` should additionally surface project-level rollups now
   that scalar outputs exist (kept identical to today's shape for now).

## Decisions captured (this session)

- **Contract:** free to redesign for 1.0.0.
- **Phases:** keep 3-phase (pre/main/post) on `GitHubToken`.
- **Throttling:** rely on library resilience; no hand-rolled delays (pending #139).
- **Concurrency:** keep repo processing sequential.
- **Inputs:** rename `app-id`→`app-client-id`; drop `log-level` and
  `skip-token-revoke`.
- **Outputs:** keep `results` JSON; add `success` / `repos-*` scalars.
