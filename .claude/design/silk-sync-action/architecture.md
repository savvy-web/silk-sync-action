---
status: current
module: silk-sync-action
category: architecture
created: 2026-02-09
updated: 2026-05-29
last-synced: 2026-05-29
completeness: 95
related: []
dependencies: []
implementation-plans:
  - ../plans/silk-sync-action.md
---

# Silk Sync Action - Architecture

GitHub Action that synchronizes repository settings, labels and GitHub Projects V2 linking across a GitHub organization (or personal account) using a centralized configuration file. Built on Effect-TS and `@savvy-web/github-action-effects` v2, which supplies the entire service layer (auth, resilient REST/GraphQL clients, state, outputs and reporting). This action contributes only the Silk-specific domain logic on top.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [System Architecture](#system-architecture)
5. [Module Structure](#module-structure)
6. [Schemas and Types](#schemas-and-types)
7. [Service Layer](#service-layer)
8. [Data Flow](#data-flow)
9. [Integration Points](#integration-points)
10. [Error Handling](#error-handling)
11. [Testing Strategy](#testing-strategy)
12. [Build Pipeline](#build-pipeline)
13. [Future Enhancements](#future-enhancements)
14. [Related Documentation](#related-documentation)

---

## Overview

The Silk Sync Action enforces organizational consistency across GitHub repositories. It reads a user-provided JSON configuration file (validated against a published JSON schema) and applies standardized labels, repository settings and GitHub Projects V2 linking to target repositories.

**Two discovery modes (combinable as union):**

- **Custom properties mode:** Discovers repos via arbitrary GitHub custom properties (e.g. `workflow=standard`). Multiple properties use AND logic (repo must match all), matched case-insensitively. Requires org-level custom properties.
- **Explicit repos mode:** Accepts a multiline list of repository names (bare names or `owner/repo`). For personal accounts or orgs without custom properties.

Both modes can be used simultaneously; results are merged and deduplicated by full repository name (case-insensitive). When a repo appears in both, the org-discovered custom properties win.

**Key design principles:**

- **Library-supplied service layer:** All cross-cutting concerns — App auth, resilient REST/GraphQL clients, retry/backoff, action state, outputs and step-summary markdown — come from `@savvy-web/github-action-effects`. This action owns only domain logic.
- **Configuration-driven:** All sync behavior derives from a user-provided JSON config file with a published JSON schema generated from the same Effect Schema used for runtime validation.
- **Dual discovery:** Custom properties and explicit repo lists, combinable as union.
- **Idempotent:** Running the action multiple times produces the same result.
- **Resilient by default:** Rate-limit handling (429) and transient 5xx retries/backoff are handled inside the library `GitHubClient`, not by hand-rolled throttling here.
- **Error accumulating:** Per-repo errors do not halt the run; all results are reported.

**When to reference this document:**

- When modifying sync workflow logic in `src/`
- When adding new sync capabilities (settings, labels, projects)
- When debugging discovery, API or permission issues
- When understanding how this action wires the library service layer

---

## Current State

The action is a compiled TypeScript action built on `@savvy-web/github-action-effects` v2 and `@savvy-web/github-action-builder`. It runs as a three-phase `node24` action (`pre` -> `main` -> `post`) whose lifecycle is driven by the library's `Action.run` entrypoint and `GitHubToken` token lifecycle.

**Source is a flat `src/` layout** (no `src/lib/` tree). Key files:

- `src/pre.ts`, `src/main.ts`, `src/post.ts` — the three phase entrypoints, each a thin `Action.run(program, { layer })` shell
- `src/program.ts` — the main Effect program (the orchestration body of `main`)
- `src/layers/app.ts` — `PreLive` / `MainLive` / `PostLive` layer compositions
- `src/schemas.ts` — domain schemas (`SilkConfig`, `DiscoveredRepo`, results) and `ResultsOutput`
- `src/errors.ts` — domain `TaggedError`s (`DiscoveryError`, `InvalidInputError`)
- `src/state.ts` — `StartTimeState` Schema class for cross-phase state
- `src/inputs.ts` — input parsing into `SilkInputs`
- `src/github/reads.ts` — typed REST wrappers over the library `GitHubClient`
- `src/discovery/`, `src/sync/`, `src/reporting/` — the domain logic
- `action.yml` — action manifest (`node24`, three phases)
- `action.config.ts` — `github-action-builder` build config (entries + ignore list)
- `lib/scripts/generate-schema.ts` — build-time JSON Schema generator

### Phase summary

- **pre (`src/pre.ts` -> `pre`):** Persist start time via `ActionState`. Provision a GitHub App installation token via `GitHubToken.provision`, asserting the token carries at least `REQUIRED_PERMISSIONS` (fail fast otherwise). No config loading here — the pre step runs before `actions/checkout`, so the config file is not yet on disk.
- **main (`src/main.ts` -> `program`):** Resolve a `GitHubClient` built from the persisted token, parse inputs, load and validate the config, discover repos, resolve projects, process each repo with error accumulation, write a step summary and set outputs.
- **post (`src/post.ts` -> `post`):** Log total duration (from the persisted start time) and dispose (revoke) the installation token via `GitHubToken.dispose`. Defects are swallowed as warnings so post never fails the job.

---

## Rationale

### Decision 1: Build on `@savvy-web/github-action-effects` v2

**Context:** The previous implementation hand-rolled everything against `@actions/*` and `@octokit/*`: custom `Context.Tag` REST/GraphQL services, App auth, rate-limit throttling, `core.saveState` state passing and `NodeRuntime.runMain` entrypoints. That surface was large, error-prone and duplicated across Silk actions.

**Chosen:** Delete the entire bespoke service/auth/throttle layer and consume the library equivalents: `Action.run`, `GitHubClient`, `GitHubGraphQL`, `GitHubToken`, `ConfigLoader`, `ActionState`, `ActionOutputs`, `ErrorAccumulator`, `GithubMarkdown`/`Step`.

**Why:**

- The library owns resilience (429 + 5xx retry/backoff inside `GitHubClient`), so this action no longer ships a rate-limit module or inter-repo/inter-item sleeps.
- App auth becomes a three-call lifecycle (`provision` / `client()` / `dispose`) instead of hand-managed Octokit auth and token revocation.
- State is Schema-typed (`ActionState.save` / `getOptional`) instead of stringly-typed `core.saveState`.
- Runtime dependencies shrink to `effect`, `@effect/platform(-node)` and the library.

### Decision 2: Dual discovery (org + personal)

Support both org discovery (via custom properties) and explicit repo lists. Org mode is self-service and queryable but org-only; explicit mode works without org admin access. The two modes union, so a repo without the right custom properties can still be force-included by name. See `src/discovery/index.ts`.

### Decision 3: User-provided config with a generated JSON schema

Label definitions and repository settings come from a user-provided JSON config file. The published `silk.config.schema.json` is generated from the `SilkConfig` Effect Schema at build time (`lib/scripts/generate-schema.ts`, `JSONSchema.make(SilkConfig)`), so IDE autocompletion and runtime validation share one source of truth. `SilkConfig` carries an optional `$schema` field so users can reference the schema in their config without a validation error.

### Decision 4: Three-phase execution via the `GitHubToken` lifecycle

The pre/main/post split is preserved, but auth is now the library token lifecycle rather than hand-rolled Octokit. `pre` provisions the token and verifies permissions before any sync work; `main` builds its `GitHubClient` from the persisted token; `post` disposes it for hygiene even if `main` fails. Config loading lives in `main` because `pre` runs before checkout.

### Decision 5: `octokit.request` for the custom-properties endpoint

The typed Octokit REST methods still do not cover `GET /orgs/{org}/properties/values`. `src/github/reads.ts` calls it through `GitHubClient.paginate` using `octokit.request(...)` with a locally-typed response row, then normalizes each row into the `OrgRepoProperty` shape. This keeps the typing gap isolated to one wrapper while still benefiting from the library client's pagination and resilience.

### Decision 6: Stable operation-name keys for the library client

Every REST/GraphQL call passes a stable operation name (e.g. `"issues.listLabelsForRepo"`, `"resolveProject"`) as the first argument to `GitHubClient.rest`/`paginate` and `GitHubGraphQL.query`/`mutation`. The library uses these keys for logging, retry bookkeeping and step grouping, so they must stay stable and descriptive.

### Constraints

- **Custom properties availability:** Only GitHub Organizations expose custom properties, and only an org admin can configure them. Mitigated by the explicit-repo discovery fallback.
- **Required App permissions:** Declared once in `REQUIRED_PERMISSIONS` in `src/pre.ts` and asserted by `GitHubToken.provision`. Currently `administration: write`, `issues: write`, `organization_custom_properties: read`, `organization_projects: write`.
- **Rate limits:** Handled by the library `GitHubClient` (automatic 429/5xx retry + backoff). This action does not implement its own throttling.

---

## System Architecture

### Execution model

Three-phase Node.js 24 action (pre -> main -> post), declared in `action.yml`:

```yaml
runs:
  using: node24
  pre: dist/pre.js
  main: dist/main.js
  post: dist/post.js
```

Each entrypoint is a thin shell: `pre.ts` and `post.ts` guard on `process.env.GITHUB_ACTIONS` and call `Action.run(<program>, { layer })`; `main.ts` calls `Action.run(program, { layer: MainLive })` unconditionally. `Action.run` (from the library) is the replacement for the former `NodeRuntime.runMain`.

### Layer composition (`src/layers/app.ts`)

This is the load-bearing wiring between the action and the library:

- **`PreLive` / `PostLive`:** `GitHubAppLive` (provided `OctokitAuthAppLive` + `FetchHttpClient.layer`) merged with `NodeFileSystem.layer`. Supplies App auth (for token provision/dispose) plus a filesystem for `ActionState`.
- **`MainLive`:** a `GitHubClient` built from the persisted installation token via `GitHubToken.client()` (provided `ActionStateLive`, `Layer.orDie`), a `GitHubGraphQL` layered on that client, and `ConfigLoaderLive`. This is the only place the persisted token is turned back into an authenticated client.

### Action contract (`action.yml`)

**Inputs** — required: `app-client-id`, `app-private-key`, `config-file` (default `.github/silk.config.json`). Discovery (at least one required): `custom-properties` (multiline `key=value`, AND logic) and/or `repos` (multiline names). Options: `dry-run`, `remove-custom-labels`, `sync-settings`, `sync-projects`, `skip-backfill`.

**Outputs:** `results` (full JSON, shape = `ResultsOutput` in `src/schemas.ts`) plus scalar convenience outputs `success`, `repos-total`, `repos-succeeded`, `repos-failed`.

This contract is a **breaking change for 1.0.0** relative to the original action: `app-id` became `app-client-id`, the `log-level` and `skip-token-revoke` inputs were removed (logging is the library's concern; token revocation is unconditional via `GitHubToken.dispose`), and the scalar outputs were added.

```yaml
# Organization with custom properties
- uses: savvy-web/silk-sync-action@v1
  with:
    app-client-id: ${{ secrets.APP_CLIENT_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    config-file: .github/silk.config.json
    custom-properties: |
      workflow=standard

# Personal account / explicit repos (union with custom-properties if both given)
- uses: savvy-web/silk-sync-action@v1
  with:
    app-client-id: ${{ secrets.APP_CLIENT_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    config-file: .github/silk.config.json
    repos: |
      my-repo-1
      owner/my-repo-2
```

---

## Module Structure

```text
src/
+-- pre.ts                  # Pre entrypoint: REQUIRED_PERMISSIONS + GitHubToken.provision
+-- main.ts                 # Main entrypoint: Action.run(program, { layer: MainLive })
+-- post.ts                 # Post entrypoint: duration log + GitHubToken.dispose
+-- program.ts              # Main Effect program (orchestration body)
+-- layers/
|   +-- app.ts              # PreLive / MainLive / PostLive layer compositions
+-- schemas.ts              # SilkConfig, domain types, ResultsOutput
+-- errors.ts               # DiscoveryError, InvalidInputError (TaggedError)
+-- state.ts                # StartTimeState (ActionState Schema class)
+-- inputs.ts               # parseInputs -> SilkInputs
+-- github/
|   +-- reads.ts            # typed REST wrappers over GitHubClient (incl. custom-properties via octokit.request)
+-- discovery/
|   +-- index.ts            # discoverRepos: union + dedupe
|   +-- customProperties.ts # discoverByCustomProperties (AND-match)
|   +-- explicit.ts         # discoverByExplicitList
+-- sync/
|   +-- processRepos.ts     # ErrorAccumulator.forEachAccumulate over repos
|   +-- syncRepo.ts         # per-repo orchestration (labels -> settings -> project)
|   +-- labels.ts           # syncLabels
|   +-- settings.ts         # syncSettings (SYNCABLE_KEYS diff)
|   +-- projects.ts         # resolveProjects (cache) + syncProject (link + backfill)
+-- reporting/
    +-- stats.ts            # aggregateStats -> SyncStats
    +-- summary.ts          # buildSummaryMarkdown (GithubMarkdown)
lib/
+-- scripts/
    +-- generate-schema.ts  # build-time JSON Schema generation from SilkConfig
```

Each source file has a co-located `*.test.ts`. The boundaries worth knowing:

- **Discovery** (`src/discovery/`) produces `DiscoveredRepo[]`. `customProperties.ts` matches AND/case-insensitively over the rows returned by `listOrgRepoProperties`; `explicit.ts` validates each name via `getRepo`; `index.ts` unions and dedupes by lowercased `fullName` (org properties win on conflict) and fails with `DiscoveryError` when nothing is found.
- **Sync** (`src/sync/`) is a strict delegation chain: `processRepos` -> `ErrorAccumulator.forEachAccumulate` -> `syncRepo` -> `syncLabels` / `syncSettings` / `syncProject`. `syncRepo` never fails (it captures errors into `SyncErrorRecord[]`), so the accumulator's `failures` is always empty and `successes` is every result. See `src/sync/syncRepo.ts` for the exact ordering and the `project-tracking` / `project-number` custom-property gate on project sync.
- **Projects** (`src/sync/projects.ts`) is two-phase: `resolveProjects` resolves every unique project number once into a `ProjectCache` (`Map<number, ProjectCacheEntry>`, closed/missing projects cached as errors), then `syncProject` reads from that cache to link the repo and optionally backfill open issues/PRs. "Already linked" / "already exists" are detected from the GraphQL error text (`isAlreadyExists`) and treated as success, not failure.
- **Reporting** (`src/reporting/`) is pure: `aggregateStats` folds `RepoSyncResult[]` into `SyncStats`, and `buildSummaryMarkdown` renders that via the library `GithubMarkdown` helpers. The same `SyncStats` feeds both the step summary and the `results` output in `program.ts`.

---

## Schemas and Types

Domain schemas live in `src/schemas.ts`; domain errors in `src/errors.ts`. Types use `Schema.Struct` with `typeof X.Type` inference; errors use `Schema.TaggedError` with a custom `get message()`.

The cardinal config type is `SilkConfig` (`{ $schema?, labels: LabelDefinition[], settings: RepositorySettings }`). It is the contract for both the user config file and the generated JSON schema, so its shape must stay stable. `RepositorySettings` enumerates the syncable keys (mirrored by `SYNCABLE_KEYS` in `src/sync/settings.ts`).

`DiscoveredRepo` stores all custom properties as a flat `Record<string, string>` rather than named boolean fields; project tracking is decided at sync time by reading `project-tracking` / `project-number` from that map. `RepoSyncResult` is the per-repo outcome and `ResultsOutput` is the JSON output contract (the Schema passed to `ActionOutputs.setJson`). See `src/schemas.ts` for full field lists; do not enumerate them here.

Raw GitHub REST response shapes (`GitHubRepo`, `GitHubLabel`, `GitHubIssue`, `OrgRepoProperty`) are plain TypeScript interfaces in `src/github/reads.ts`, not Effect schemas, since they describe Octokit responses rather than validated domain data.

Domain errors are only `InvalidInputError` (fatal, raised during input parsing) and `DiscoveryError` (fatal, raised when no repos are discovered). All transport-level failures surface as the library's `GitHubClientError` / `GitHubGraphQLError`, which carry a `reason` string and (for REST) a `status` code used in `syncSettings` to special-case 422 org-policy rejections.

---

## Service Layer

The service layer is entirely supplied by `@savvy-web/github-action-effects`. This action defines no `Context.Tag` services of its own; it composes library layers in `src/layers/app.ts` and consumes the library tags directly.

- **`Action.run`** — entrypoint runner for each phase (replaces `NodeRuntime.runMain`).
- **`GitHubToken`** — App-token lifecycle: `provision({ permissions })` in `pre`, `client()` (a `Layer`) in `MainLive`, `dispose()` in `post`. Replaces hand-rolled `@octokit/auth-app` auth and `DELETE /installation/token` revocation.
- **`GitHubClient`** — resilient REST client with `rest(opName, fn)` for single calls and `paginate<T>(opName, fn)` for paged calls; automatic 429/5xx retry + backoff. Replaces the old `GitHubRestClient` Tag and the entire `rate-limit/` module. `src/github/reads.ts` wraps it into typed helpers (`getRepo`, `listLabels`, `createLabel`, `updateLabel`, `deleteLabel`, `updateRepo`, `listOpenIssues`, `listOrgRepoProperties`).
- **`GitHubGraphQL`** — `query`/`mutation` for Projects V2; layered on `GitHubClient`. Replaces the old `GitHubGraphQLClient` Tag. Used directly in `src/sync/projects.ts`.
- **`ConfigLoader`** — `loadJson(path, Schema)` reads and validates the user config in `program.ts`. Replaces the old `src/lib/config/load.ts`.
- **`ActionState`** — Schema-typed cross-phase state (`save` / `getOptional`), used for `StartTimeState`. Replaces `core.saveState`/`getState`.
- **`ActionOutputs`** — `set`, `setJson(name, value, Schema)`, `summary(markdown)`, `setFailed`. Used in `program.ts`.
- **`ErrorAccumulator.forEachAccumulate`** — sequential per-repo iteration with success/failure accumulation, used in `src/sync/processRepos.ts`.
- **`GithubMarkdown` / `Step`** — `GithubMarkdown` builds the summary tables (`src/reporting/summary.ts`); `Step.groupStep` wraps discovery and sync into collapsible step groups in `program.ts`.

---

## Data Flow

```text
PRE (Action.run(pre, { layer: PreLive })):
[ActionState.save startTime <- StartTimeState]
[GitHubToken.provision({ permissions: REQUIRED_PERMISSIONS })]
   -> persists installation token; asserts permissions; fails fast otherwise
   (no config load -- runs before actions/checkout)

MAIN (Action.run(program, { layer: MainLive })):
[GitHubClient from persisted token]  [ActionOutputs]
      |
      v
[parseInputs] -> SilkInputs            (InvalidInputError if no discovery method)
      |
      v
[ConfigLoader.loadJson(configFile, SilkConfig)] -> SilkConfig
      |
      v
[Step.groupStep "Discover repositories": discoverRepos(org, inputs)]
  +-- custom properties: listOrgRepoProperties (paginate via octokit.request) -> AND/case-insensitive match
  +-- explicit repos:    getRepo per name (validate, capture node_id)
  +-- union + dedupe by lowercased fullName (org props win) -> DiscoveredRepo[]
      |
      v
[projectNumbersOf(repos)]  (project-tracking=="true" -> project-number)
      |
      v
[resolveProjects(org, numbers)] -> ProjectCache  (GraphQL; closed/missing cached as errors)
      |
      v
[Step.groupStep "Sync repositories": processRepos(...)]
  ErrorAccumulator.forEachAccumulate over repos (sequential):
    syncRepo:
      +-- getRepo (node_id + current settings; failure captured, non-fatal)
      +-- syncLabels   (create / update / remove-custom / unchanged)
      +-- syncSettings (diff SYNCABLE_KEYS, PATCH changed keys; 422 -> warning) [if sync-settings]
      +-- syncProject  (link via cache; backfill open issues unless skip-backfill) [if sync-projects & tracking]
  -> RepoSyncResult[]
      |
      v
[aggregateStats] -> SyncStats
      |
      +-- ActionOutputs.summary(buildSummaryMarkdown(stats, inputs))
      +-- ActionOutputs.setJson("results", { success, dryRun, repos, labels, settings, projects, errors }, ResultsOutput)
      +-- ActionOutputs.set("success" | "repos-total" | "repos-succeeded" | "repos-failed")

POST (Action.run(post, { layer: PostLive })):
[ActionState.getOptional startTime] -> log total duration
[GitHubToken.dispose()] -> revoke installation token (warn on failure; defects swallowed)
```

Resilience (rate-limit/429 handling, 5xx retry, backoff) is internal to `GitHubClient` and `GitHubGraphQL`; there is no separate rate-limit flow in this action.

---

## Integration Points

### GitHub REST API

Authentication is a GitHub App installation token provisioned by `GitHubToken` in `pre` and turned into an authenticated `GitHubClient` in `MainLive`. Endpoints used (all via `src/github/reads.ts`): repo get/update, label list/create/update/delete, open issues list and `GET /orgs/{org}/properties/values` (via `octokit.request` through `paginate`). See `src/github/reads.ts` for the exact operation-name keys.

### GitHub GraphQL API

Three Projects V2 operations in `src/sync/projects.ts`: `resolveProject` (query), `linkRepoToProject` and `addItemToProject` (mutations), all via `GitHubGraphQL`.

### Required App permissions

Declared in `REQUIRED_PERMISSIONS` (`src/pre.ts`) and enforced at provision time: `administration: write` (labels + settings), `issues: write`, `organization_custom_properties: read` (discovery), `organization_projects: write` (linking + backfill). The workflow itself needs only `contents: read`.

### Key dependencies

| Package | Purpose |
| :------ | :------ |
| `effect` | Schema, Layer, Effect (core Effect-TS) |
| `@effect/platform` / `@effect/platform-node` | `FetchHttpClient`, `NodeContext`, `NodeFileSystem` for layer wiring |
| `@savvy-web/github-action-effects` | Entrypoints, auth, REST/GraphQL clients, state, outputs, reporting (the service layer) |
| `@savvy-web/github-action-builder` (dev) | `@vercel/ncc` bundling + `action.yml` validation |

The previous direct dependencies on `@actions/core`, `@actions/github`, `@octokit/auth-app`, `@octokit/request` and `@octokit/rest` are gone; those concerns now live behind the library.

---

## Error Handling

Two-tier strategy:

- **Fatal (fail the step):** `InvalidInputError` (bad/missing discovery inputs), config-load failures (surfaced by `ConfigLoader`) and `DiscoveryError` (no repos found). These propagate to the top-level `Effect.catchAll` in `program.ts`, which calls `ActionOutputs.setFailed`.
- **Non-fatal (accumulate and continue):** every per-repo operation. `syncRepo` wraps the repo fetch, label, settings and project work so failures are captured into `SyncErrorRecord[]` rather than thrown. `syncSettings` special-cases REST `status === 422` (org-enforced policy) as a warning. `processRepos` runs repos sequentially through `ErrorAccumulator.forEachAccumulate`; because `syncRepo` never fails, the accumulator's `successes` is the full result list.

### Dry-run mode

When `dry-run: true`, reads run normally but every write is skipped; `syncLabels`/`syncSettings` still compute and record the changes that would be made, project link status becomes `"dry-run"`, and the summary header switches to "Silk Sync (dry-run)". Statistics reflect the would-be changes.

---

## Testing Strategy

Vitest with v8 coverage, `pool: "forks"` for Effect-TS compatibility. Every `src` file has a co-located `*.test.ts`. Tests provide the library service tags via Effect layers and run programs with `Effect.runPromise`; mock the library `GitHubClient` / `GitHubGraphQL` / `ActionState` / `ActionOutputs` tags rather than the deleted bespoke services. See the `*.test.ts` files next to each module for the exact fixtures.

---

## Build Pipeline

### Turbo task graph

```text
types:check -> generate:schema -> build:prod
```

- **`types:check`** — `tsgo --noEmit`.
- **`generate:schema`** — runs `lib/scripts/generate-schema.ts` (`JSONSchema.make(SilkConfig)` from `src/schemas.ts`) to produce `silk.config.schema.json`, then `biome format --write`.
- **`build:prod`** — `github-action-builder build`, driven by `action.config.ts`.

### `action.config.ts`

Defines the three build entries (`pre`/`main`/`post`), `minify: true`, and an `ignore` list (`xmlbuilder2`, `libxmljs2`, `ajv-formats-draft2019`). Those are optional XML/JSON-validator plugins pulled in transitively by `@cyclonedx/cyclonedx-library` (via the library) that this action never invokes; `ignore` aliases them to a throwing stub that cyclonedx's `_optPlug` wrapper catches and falls through. They are deliberately *ignored*, not declared `externals` (which would mean "present at runtime"). `persistLocal` writes a local copy of the built action to `.github/actions/local`.

Output: `dist/pre.js`, `dist/main.js`, `dist/post.js`.

---

## Future Enhancements

- Branch protection / ruleset synchronization
- Repository security settings (vulnerability alerts, secret scanning)
- Drift-detection / audit-only reporting mode
- Configuration inheritance (base + per-repo overrides)
- Multi-org support

---

## Related Documentation

**Implementation plan:**

- [Silk Sync Action Plan](../plans/silk-sync-action.md)

**Migration reference (on this branch, separate tree):**

- `docs/superpowers/specs/2026-05-29-silk-sync-effects-migration-design.md` — the migration design spec
- `docs/superpowers/plans/2026-05-29-silk-sync-effects-migration.md` — the migration implementation plan

**Reference implementation:**

- `pnpm-config-dependency-action` — same Effect-TS + `@savvy-web/github-action-effects` patterns

**Project files:**

- `action.yml` — action manifest (node24, three phases)
- `action.config.ts` — build config
- `silk.config.schema.json` — generated JSON schema for config validation
- `src/program.ts`, `src/layers/app.ts` — main program and layer wiring
- `src/pre.ts`, `src/main.ts`, `src/post.ts` — phase entrypoints

**External resources:**

- [GitHub REST API - Labels](https://docs.github.com/en/rest/issues/labels)
- [GitHub REST API - Repos](https://docs.github.com/en/rest/repos/repos)
- [GitHub GraphQL - ProjectV2](https://docs.github.com/en/graphql/reference/objects#projectv2)
- [GitHub Custom Properties](https://docs.github.com/en/organizations/managing-organization-settings/managing-custom-properties-for-repositories-in-your-organization)
- [Effect-TS Documentation](https://effect.website)

---

**Document Status:** Current — reflects the rewrite onto `@savvy-web/github-action-effects` v2: library-supplied service layer (auth, resilient REST/GraphQL, state, outputs, reporting), flat `src/` layout, `GitHubToken` three-phase lifecycle, `action.config.ts` build config and the 1.0.0 breaking input/output contract change. Last synced with codebase on 2026-05-29.
