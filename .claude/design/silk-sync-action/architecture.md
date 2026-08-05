---
status: current
module: silk-sync-action
category: architecture
created: 2026-02-09
updated: 2026-08-04
last-synced: 2026-08-04
completeness: 85
related: []
dependencies: []
implementation-plans: []
---

# Silk Sync Action - Architecture

GitHub Action that synchronizes repository settings, labels and GitHub Projects V2 linking across a GitHub organization (or personal account) using a centralized configuration file. Built on Effect **v4** (`effect@4.0.0-beta.101`, resolved via `catalog:effect`) and the `@effected/*` kit, which supplies the entire service layer (auth, typed REST/GraphQL client, state, outputs and reporting). This action contributes only the Silk-specific domain logic on top.

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
13. [Known Follow-ups](#known-follow-ups)
14. [Future Enhancements](#future-enhancements)
15. [Related Documentation](#related-documentation)

---

## Overview

The Silk Sync Action enforces organizational consistency across GitHub repositories. It reads a user-provided JSON configuration file (validated against a published JSON schema) and applies standardized labels, repository settings and GitHub Projects V2 linking to target repositories.

**Two discovery modes (combinable as union):**

- **Custom properties mode:** Discovers repos via arbitrary GitHub custom properties (e.g. `workflow=standard`). Multiple properties use AND logic (repo must match all), matched case-insensitively. Requires org-level custom properties.
- **Explicit repos mode:** Accepts a multiline list of repository names (bare names or `owner/repo`). For personal accounts or orgs without custom properties.

Both modes can be used simultaneously; results are merged and deduplicated by full repository name (case-insensitive). When a repo appears in both, the org-discovered custom properties win.

**Key design principles:**

- **Kit-supplied service layer:** All cross-cutting concerns — App auth, resilient typed REST/GraphQL clients, retry/backoff, action state, outputs, logging and step-summary markdown — come from the `@effected/*` packages. This action owns only domain logic.
- **Configuration-driven:** All sync behavior derives from a user-provided JSON config file with a published JSON schema generated from the same Effect Schema used for runtime validation.
- **Dual discovery:** Custom properties and explicit repo lists, combinable as union.
- **Idempotent:** Running the action multiple times produces the same result.
- **Resilient by default:** Rate-limit handling (429) and transient 5xx retries/backoff live inside the kit's `GitHubClient`, not in hand-rolled throttling here.
- **Error accumulating:** Per-repo errors do not halt the run; all results are reported.

**When to reference this document:**

- When modifying sync workflow logic in `src/`
- When adding new sync capabilities (settings, labels, projects)
- When debugging discovery, API or permission issues
- When understanding how this action wires the kit service layer

---

## Current State

The action is a compiled TypeScript action built on Effect **v4** (`effect@4.0.0-beta.101`), the `@effected/*` kit (`@effected/github-actions@0.5.1`, `@effected/github@0.2.3`, `@effected/config-file@0.2.1`) and `@savvy-web/github-action-builder`. It runs as a three-phase `node24` action (`pre` -> `main` -> `post`) whose lifecycle is driven by `Action.run` and the `GitHubToken` token lifecycle.

The action previously ran on `@savvy-web/github-action-effects@3`, now deprecated and removed. `GitHubClientLive`, `GitHubGraphQL`, `ConfigLoader`, `ErrorAccumulator`, `Step.groupStep`, `GithubMarkdown` and the `/testing` subpath do not exist in the kit. The port froze the observable contract (inputs, outputs, `action.yml`, the three-phase token lifecycle, the step summary and the per-repo error semantics) — see [the parity contract](../../plans/2026-08-04-effected-port-parity-contract.md) for the frozen behavior plus its nine deliberate deviations, and [the API dossier](../../plans/2026-08-04-effected-port-api-dossier.md) for the signature-level legacy-to-kit symbol map.

**Source is a flat `src/` layout** (no `src/lib/` tree). Key files:

- `src/pre.ts`, `src/main.ts`, `src/post.ts` — the three phase entrypoints, each a thin `Action.run(program, { layer })` shell
- `src/program.ts` — the main Effect program (the orchestration body of `main`)
- `src/layers/app.ts` — `PreLive` / `MainLive` / `PostLive` layer compositions (about ten lines total)
- `src/schemas.ts` — domain schemas (`SilkConfig`, `DiscoveredRepo`, results) and `ResultsOutput`
- `src/errors.ts` — domain `TaggedErrorClass`es (`DiscoveryError`, `InvalidInputError`)
- `src/state.ts` — `StartTimeState` Schema class for cross-phase state
- `src/inputs.ts` — input parsing into `SilkInputs` via `ActionInput`
- `src/github/reads.ts` — route-literal-keyed REST wrappers over the kit `GitHubClient` / `GitHubRepository` / `GitHubIssue`
- `src/test-support.ts` — `githubTestLayer`, the shared recorded-response GitHub stack (test-only; nothing outside the three entries is bundled)
- `src/discovery/`, `src/sync/`, `src/reporting/` — the domain logic
- `action.yml` — action manifest (`node24`, three phases)
- `action.config.ts` — `github-action-builder` build config (entries + ignore list + `persistLocal`)
- `lib/scripts/generate-schema.ts` — build-time JSON Schema generator

### Phase summary

- **pre (`src/pre.ts` -> `pre`):** Persist start time via `ActionState`, read `app-client-id` / `app-private-key` explicitly, resolve the owner from `ActionEnvironment`, then provision a GitHub App installation token via `GitHubToken.provision`, asserting the token carries at least `REQUIRED_PERMISSIONS` (fail fast otherwise). No config loading here — the pre step runs before `actions/checkout`, so the config file is not yet on disk.
- **main (`src/main.ts` -> `program`):** Resolve a `GitHubClient` built from the persisted token, parse inputs, load and validate the config, discover repos, resolve projects, process each repo with error accumulation, write a step summary and set outputs.
- **post (`src/post.ts` -> `post`):** Log total duration (from the persisted start time) and dispose (revoke) the installation token via `GitHubToken.dispose`. Defects are swallowed as warnings so post never fails the job.

---

## Rationale

### Decision 1: Build on Effect v4 and the `@effected/*` kit

**Context:** The action previously consumed `@savvy-web/github-action-effects@3`, which is deprecated and removed. Before that it hand-rolled everything against `@actions/*` and `@octokit/*`.

**Chosen:** Depend on three kit packages — `@effected/github-actions` (`Action.run`, `ActionInput`, `ActionOutputs`, `ActionState`, `ActionEnvironment`, `ActionLogger`, `GitHubToken`, `GitHubMarkdown`), `@effected/github` (`GitHubClient` for typed REST + GraphQL, `GitHubApp`, `GitHubRepository`, `GitHubIssue`, `Repo`/`RepoRef`, `GitHubError`) and `@effected/config-file` (`ConfigFile.read` + `JsonCodec`) — plus `effect` and `@effect/platform-node`.

**Why:**

- The kit owns resilience (429 + 5xx retry/backoff inside `GitHubClient`), so this action ships no rate-limit module and no inter-repo sleeps.
- App auth is a three-call lifecycle (`provision` / `clientLayer()` / `dispose`) rather than hand-managed Octokit auth and token revocation.
- State is Schema-typed (`ActionState.save` / `getOptional`) instead of stringly-typed `core.saveState`.
- `Action.run` composes `ActionRuntime.layer` internally, so the platform services, HTTP client and the workflow-command `Logger` arrive for free. That collapsed `src/layers/app.ts` from 27 lines of hand-composed platform wiring to about ten lines of GitHub-specific layers.
- There are no direct `@actions/*` or `@octokit/*` dependencies — octokit is owned by `@effected/github`.

### Decision 2: Dual discovery (org + personal)

Support both org discovery (via custom properties) and explicit repo lists. Org mode is self-service and queryable but org-only; explicit mode works without org admin access. The two modes union, so a repo without the right custom properties can still be force-included by name. See `src/discovery/index.ts`.

### Decision 3: User-provided config with a generated JSON schema

Label definitions and repository settings come from a user-provided JSON config file. The published `silk.config.schema.json` is generated from the `SilkConfig` Effect Schema at build time (`lib/scripts/generate-schema.ts`), so IDE autocompletion and runtime validation share one source of truth. Under Effect v4 the generator is `JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(SilkConfig))`: `toJsonSchemaDocument` emits a 2020-12 `Document`, and `toDocumentDraft07` rewrites it into a draft-07 doc with a `definitions` map plus a root `$ref` (the script then splices in `$schema`/`title`/`description` metadata). Note the v4 emitter's shape: optional/nullable fields render as `anyOf: [T, null]` and Schema checks (min/max/pattern) render as `allOf` entries. `SilkConfig` carries an optional `$schema` field so users can reference the schema in their config without a validation error. The generated file was byte-frozen across the `@effected` port — `src/schemas.ts` uses core `effect` only and did not change.

### Decision 4: Three-phase execution via the `GitHubToken` lifecycle

The pre/main/post split is preserved. `pre` provisions the token and verifies permissions before any sync work; `main` builds its `GitHubClient` from the persisted token; `post` disposes it for hygiene even if `main` fails. Config loading lives in `main` because `pre` runs before checkout.

The kit's `provision` takes the App credentials as arguments rather than reading them itself, so `src/pre.ts` reads `app-client-id` and `app-private-key` explicitly (under exactly the names `action.yml` declares) and passes `owner` from `ActionEnvironment` so an App installed in more than one account still resolves the right installation. The legacy `permissions` option is now `required`.

### Decision 5: The route literal is the key

Every REST call is `client.request(<route>, params)` or `client.paginate(<route>, params)` with a route literal such as `"GET /repos/{owner}/{repo}"`. The literal types both the params and the response, so there are no casts, no `octokit.request()` escape hatch and no stringly-typed `operation` names. `GET /orgs/{org}/properties/values` *is* in octokit's paginating route map — the old "typing gap" note was stale. Its one genuine gap is `repository_node_id`, which GitHub returns on the wire but octokit's generated type omits; `src/github/reads.ts` recovers it with a small `Schema.decodeUnknownOption` so the read stays total and cast-free.

### Decision 6: `Repo` is ambient, resolved per call

Every wrapper in `src/github/reads.ts` reads `yield* Repo` rather than accepting an `(owner, repo)` pair. `Repo.provide(new RepoRef(...))` is applied at two boundaries only: once at `syncRepo`'s own boundary, so the whole per-repo chain acts on that repository without threading arguments, and once per candidate name in `src/discovery/explicit.ts`, which validates repositories that are not yet the ambient one. `Repo` is never provided as a layer. Some helpers (`syncLabels`, `syncProject`) still take `owner`/`repo` strings, but only for log and result text — their API calls resolve `Repo`.

### Decision 7: Branch on `GitHubError.kind`, never on message text

The kit collapses REST failures into one `GitHubError` with a `kind` discriminant (`notFound`, `alreadyExists`, `rejected`, `unauthorized`, `rateLimited`, `transport`, `decode`) and GraphQL failures into `GitHubGraphQLError` with the same discriminant. "Already linked" / "already exists" in `src/sync/projects.ts` is detected as `e.kind === "alreadyExists"`, replacing a lowercase grep of the rendered error message. Errors carry `operation`, `reason` and (for REST) an optional `status`, which `syncSettings` uses to special-case 422 org-policy rejections.

### Decision 8: `Effect.partition` for per-repo accumulation

The kit ships no `ErrorAccumulator` successor, deliberately. `src/sync/processRepos.ts` uses `Effect.partition`, which runs every effect and never fails. Because `syncRepo`'s error channel is `never` by contract, the failure half is statically empty and the success half is every result; the destructure documents that rather than hiding it.

### Constraints

- **Custom properties availability:** Only GitHub Organizations expose custom properties, and only an org admin can configure them. Mitigated by the explicit-repo discovery fallback.
- **Required App permissions:** Declared once in `REQUIRED_PERMISSIONS` in `src/pre.ts` and asserted by `GitHubToken.provision` via its `required` option. Currently `administration: write`, `issues: write`, `organization_custom_properties: read`, `organization_projects: write`.
- **Rate limits:** Handled by the kit's `GitHubClient` (automatic 429/5xx retry + backoff). This action does not implement its own throttling.
- **Layers passed to `Action.run` must have error channel `never`.** `ActionRunOptions.layer` is `Layer.Layer<R, never, ActionServices>`, which is why `GitHubToken.clientLayer()` carries a `Layer.orDie`: a missing or expired persisted token is a failure of the `pre` phase, not something `main` can recover from.

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

Each entrypoint is a thin shell guarded on `process.env.GITHUB_ACTIONS` that calls `Action.run(<program>, { layer })`. `Action.run` composes `ActionRuntime.layer` internally, supplying `ActionEnvironment`, `ActionLogger`, `ActionOutputs`, `ActionState`, the Node platform services and an `HttpClient`.

### Layer composition (`src/layers/app.ts`)

This is the load-bearing wiring between the action and the kit, and it is now small:

- **`PreLive` / `PostLive`:** `GitHubApp.layer` — nothing else. The layer has no requirements; it owns its own octokit and JWT signing. Everything else `pre`/`post` touch comes from `ActionRuntime.layer`.
- **`MainLive`:** `GitHubToken.clientLayer().pipe(Layer.orDie)` for the `GitHubClient` built from the token `pre` persisted, plus `GitHubRepository.layer` and `GitHubIssue.layer` provided over that client. This is the only place the persisted token is turned back into an authenticated client.

### Action contract (`action.yml`)

**Inputs** — required: `app-client-id`, `app-private-key`, `config-file` (default `.github/silk.config.json`). Discovery (at least one required): `custom-properties` (multiline `key=value`, AND logic) and/or `repos` (multiline names). Options: `dry-run`, `remove-custom-labels`, `sync-settings`, `sync-projects`, `skip-backfill`.

**Outputs:** `results` (full JSON, shape = `ResultsOutput` in `src/schemas.ts`) plus scalar convenience outputs `success`, `repos-total`, `repos-succeeded`, `repos-failed`.

This contract was a **breaking change for 1.0.0** relative to the original action: `app-id` became `app-client-id`, the `log-level` and `skip-token-revoke` inputs were removed (logging is the kit's concern; token revocation is unconditional via `GitHubToken.dispose`), and the scalar outputs were added. The `@effected` port kept `action.yml` byte-frozen.

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
+-- errors.ts               # DiscoveryError, InvalidInputError (TaggedErrorClass)
+-- state.ts                # StartTimeState (ActionState Schema class)
+-- inputs.ts               # parseInputs -> SilkInputs (ActionInput)
+-- test-support.ts         # githubTestLayer: recorded-response GitHub stack (test-only)
+-- github/
|   +-- reads.ts            # route-literal REST wrappers, resolved against the ambient Repo
+-- discovery/
|   +-- index.ts            # discoverRepos: union + dedupe
|   +-- customProperties.ts # discoverByCustomProperties (AND-match)
|   +-- explicit.ts         # discoverByExplicitList (Repo.provide per candidate)
+-- sync/
|   +-- processRepos.ts     # Effect.partition over repos
|   +-- syncRepo.ts         # per-repo orchestration (labels -> settings -> project), Repo.provide boundary
|   +-- labels.ts           # syncLabels
|   +-- settings.ts         # syncSettings (SYNCABLE_KEYS diff)
|   +-- projects.ts         # resolveProjects (cache) + syncProject (link + backfill)
+-- reporting/
    +-- stats.ts            # aggregateStats -> SyncStats
    +-- summary.ts          # buildSummaryMarkdown (GitHubMarkdown)
lib/
+-- scripts/
    +-- generate-schema.ts  # build-time JSON Schema generation from SilkConfig
```

Each source file has a matching suite under `__test__/`, mirroring the `src/` tree. The boundaries worth knowing:

- **Discovery** (`src/discovery/`) produces `DiscoveredRepo[]`. `customProperties.ts` matches AND/case-insensitively over the rows returned by `listOrgRepoProperties`; `explicit.ts` validates each name via `getRepo` under a per-candidate `Repo.provide`; `index.ts` unions and dedupes by lowercased `fullName` (org properties win on conflict) and fails with `DiscoveryError` when nothing is found.
- **Sync** (`src/sync/`) is a strict delegation chain: `processRepos` -> `Effect.partition` -> `syncRepo` -> `syncLabels` / `syncSettings` / `syncProject`. `syncRepo` never fails (it captures errors into `SyncErrorRecord[]`) and provides `Repo` once for the whole chain. See `src/sync/syncRepo.ts` for the exact ordering and the `project-tracking` / `project-number` custom-property gate on project sync.
- **Projects** (`src/sync/projects.ts`) is two-phase: `resolveProjects` resolves every unique project number once into a `ProjectCache` (`Map<number, ProjectCacheEntry>`, closed/missing projects cached as errors), then `syncProject` reads from that cache to link the repo and optionally backfill open issues/PRs. GraphQL operations are `GraphQLDocument.make({ name, document, response })` values with Schema-typed responses, sent through `client.graphql`.
- **Reporting** (`src/reporting/`) is pure: `aggregateStats` folds `RepoSyncResult[]` into `SyncStats`, and `buildSummaryMarkdown` renders that via the kit's `GitHubMarkdown` helpers. The same `SyncStats` feeds both the step summary and the `results` output in `program.ts`.

---

## Schemas and Types

Domain schemas live in `src/schemas.ts`; domain errors in `src/errors.ts`. Types use `Schema.Struct` with `typeof X.Type` inference; errors use `Schema.TaggedErrorClass` with a custom `get message()`. The schemas follow Effect v4 idioms: refinements are attached via `.check(...)` with predicate combinators (`Schema.isMinLength`, `Schema.isMaxLength`, `Schema.isPattern`) rather than the v3 `.pipe(Schema.minLength/...)` filters, and closed enums use `Schema.Literals([...])` (array form) instead of the variadic `Schema.Literal(a, b, c)`. This file depends on core `effect` only and was untouched by the `@effected` port.

The cardinal config type is `SilkConfig` (`{ $schema?, labels: LabelDefinition[], settings: RepositorySettings }`). It is the contract for both the user config file and the generated JSON schema, so its shape must stay stable. `RepositorySettings` enumerates the syncable keys (mirrored by `SYNCABLE_KEYS` in `src/sync/settings.ts`). Note that `@effected/github` also exports a type named `RepositorySettings` (the whole `GET /repos/{owner}/{repo}` payload); the local one is the config vocabulary and the kit's is deliberately not imported.

`DiscoveredRepo` stores all custom properties as a flat `Record<string, string>` rather than named boolean fields; project tracking is decided at sync time by reading `project-tracking` / `project-number` from that map. `RepoSyncResult` is the per-repo outcome and `ResultsOutput` is the JSON output contract (the Schema passed to `ActionOutputs.setJson`). See `src/schemas.ts` for full field lists; do not enumerate them here.

Raw GitHub response shapes used locally (`RepoSnapshot`, `RepoLabel`, `OrgRepoProperty`) are plain TypeScript interfaces in `src/github/reads.ts`, not Effect schemas, since they describe API responses rather than validated domain data. `RepoSnapshot` is a structural subset of the kit's repository payload narrowed to the keys `sync/settings.ts` compares plus the identity fields discovery needs, and writes go through the kit's `RepositoryPatch` so a key the endpoint does not accept is a compile error.

Domain errors are only `InvalidInputError` (fatal, raised during input parsing) and `DiscoveryError` (fatal, raised when no repos are discovered). Transport-level failures surface as the kit's `GitHubError` / `GitHubGraphQLError`, and config-load failures as `ConfigReadError`.

---

## Service Layer

The service layer is entirely supplied by the `@effected/*` kit. This action defines no services of its own; it composes kit layers in `src/layers/app.ts` and consumes kit services directly. They are class-based `Context.Service` definitions with companion `*Shape` interfaces.

From `@effected/github-actions`:

- **`Action.run`** — entrypoint runner for each phase. Composes `ActionRuntime.layer` internally and never throws; it sets `process.exitCode`.
- **`GitHubToken`** — App-token lifecycle: `provision({ appId, privateKey, owner, required })` in `pre`, `clientLayer()` (a `Layer`, `orDie`d) in `MainLive`, `dispose()` in `post`.
- **`ActionInput`** — `string`, `redacted`, `boolean`, `lines`, `list`; owns the `INPUT_` name derivation. Used in `src/inputs.ts` and `src/pre.ts`.
- **`ActionOutputs`** — `set`, `setJson(name, value, Schema)`, `summary(markdown)`, `setFailed`. Used in `program.ts`.
- **`ActionState`** — Schema-typed cross-phase state (`save` / `getOptional`), used for `StartTimeState`.
- **`ActionEnvironment`** — the one reader of `process.env`; supplies `repositoryOwner` to both `pre` and `program`.
- **`ActionLogger`** — `group(name, effect)` and `withStep(name, effect)`, composed together in `program.ts` where the legacy `Step.groupStep` used to be.
- **`GitHubMarkdown`** — summary tables and headings in `src/reporting/summary.ts`.

From `@effected/github`:

- **`GitHubApp`** — `GitHubApp.layer` for `pre`/`post`; owns its octokit and JWT signing.
- **`GitHubClient`** — `request(route, params)` and `paginate(route, params)` for REST, `graphql(document, vars)` for GraphQL, with automatic 429/5xx retry and backoff. Wrapped into typed helpers in `src/github/reads.ts`.
- **`GitHubRepository` / `GitHubIssue`** — resource services over the client (`updateSettings`, `list({ state })`), both `Repo`-scoped.
- **`Repo` / `RepoRef`** — the ambient repository, provided with `Repo.provide(ref)` rather than as a layer.
- **`GitHubError` / `GitHubGraphQLError`** — the two error surfaces, discriminated by `kind`.

From `@effected/config-file`:

- **`ConfigFile.read(path, { schema, codec: JsonCodec })`** — reads and validates the user config in `program.ts`. Only `FileSystem` is required, and `ActionRuntime.layer` already supplies it.

---

## Data Flow

```text
PRE (Action.run(pre, { layer: PreLive })):
[ActionState.save startTime <- StartTimeState]
[ActionInput.string "app-client-id" + ActionInput.redacted "app-private-key"]
[ActionEnvironment.github.repositoryOwner -> owner]
[GitHubToken.provision({ appId, privateKey, owner, required: REQUIRED_PERMISSIONS })]
   -> persists installation token; asserts permissions; fails fast otherwise
   (no config load -- runs before actions/checkout)

MAIN (Action.run(program, { layer: MainLive })):
[GitHubClient from persisted token]  [ActionOutputs]  [ActionLogger]
      |
      v
[parseInputs] -> SilkInputs            (InvalidInputError if no discovery method)
      |
      v
[ActionEnvironment.github.repositoryOwner] -> org
      |
      v
[ConfigFile.read(configFile, { schema: SilkConfig, codec: JsonCodec })] -> SilkConfig
      |
      v
[logger.group + logger.withStep "Discover repositories": discoverRepos(org, inputs)]
  +-- custom properties: paginate "GET /orgs/{org}/properties/values" -> AND/case-insensitive match
  +-- explicit repos:    getRepo per name under Repo.provide (validate, capture node_id)
  +-- union + dedupe by lowercased fullName (org props win) -> DiscoveredRepo[]
      |
      v
[projectNumbersOf(repos)]  (project-tracking=="true" -> project-number)
      |
      v
[resolveProjects(org, numbers)] -> ProjectCache  (GraphQL; closed/missing cached as errors)
      |
      v
[logger.group + logger.withStep "Sync repositories": processRepos(...)]
  Effect.partition over repos (sequential):
    syncRepo, under Repo.provide(RepoRef):
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

Resilience (rate-limit/429 handling, 5xx retry, backoff) is internal to `GitHubClient`; there is no separate rate-limit flow in this action.

---

## Integration Points

### GitHub REST API

Authentication is a GitHub App installation token provisioned by `GitHubToken` in `pre` and turned into an authenticated `GitHubClient` in `MainLive`. Endpoints used (all via `src/github/reads.ts`): repo get/update, label list/create/update/delete, open issues list and `GET /orgs/{org}/properties/values`. See `src/github/reads.ts` for the exact route literals.

### GitHub GraphQL API

Three Projects V2 documents in `src/sync/projects.ts`: `resolveProject` (query), `linkRepoToProject` and `addItemToProject` (mutations), each a `GraphQLDocument` with a Schema-typed response, sent through `GitHubClient.graphql`.

### Required App permissions

Declared in `REQUIRED_PERMISSIONS` (`src/pre.ts`) and enforced at provision time: `administration: write` (labels + settings), `issues: write`, `organization_custom_properties: read` (discovery), `organization_projects: write` (linking + backfill). The workflow itself needs only `contents: read`.

### Key dependencies

| Package | Purpose |
| :------ | :------ |
| `effect` (v4, `4.0.0-beta.101` via `catalog:effect`) | Schema, Layer, Effect (core Effect-TS); also `JsonSchema` and the HTTP client, all folded into core in v4 |
| `@effect/platform-node` | Node platform services; a required peer of `@effected/github-actions` kept as a direct dependency |
| `@effected/github-actions` (0.5.1) | `Action.run` / `ActionRuntime`, inputs, outputs, state, environment, logger, `GitHubToken`, `GitHubMarkdown` |
| `@effected/github` (0.2.3) | Typed REST + GraphQL `GitHubClient`, `GitHubApp`, `GitHubRepository`, `GitHubIssue`, `Repo`/`RepoRef`, `GitHubError` |
| `@effected/config-file` (0.2.1) | `ConfigFile.read` + `JsonCodec` for the user config |
| `@savvy-web/github-action-builder` (dev) | rsbuild/rspack bundling + `action.yml` validation |

There are no direct `@actions/*` or `@octokit/*` dependencies; octokit is owned by `@effected/github`.

---

## Error Handling

Two-tier strategy:

- **Fatal (fail the step):** `InvalidInputError` (bad/missing discovery inputs), `ConfigReadError` (config load/validate failure) and `DiscoveryError` (no repos found). These propagate to the top-level `Effect.catch` in `program.ts`, which calls `ActionOutputs.setFailed("Sync failed: <message>")` and then succeeds — `Action.run` derives the exit code from `setFailed`.
- **Non-fatal (accumulate and continue):** every per-repo operation. `syncRepo` wraps the repo fetch, label, settings and project work so failures are captured into `SyncErrorRecord[]` rather than thrown. `syncSettings` special-cases REST `status === 422` (org-enforced policy) as a warning. `processRepos` runs repos sequentially through `Effect.partition`; because `syncRepo`'s error channel is `never`, the failure half is statically empty.

Error branching is always on the `kind` discriminant of `GitHubError` / `GitHubGraphQLError` (for example `"alreadyExists"` in `src/sync/projects.ts`), never on rendered message text.

### Dry-run mode

When `dry-run: true`, reads run normally but every write is skipped; `syncLabels`/`syncSettings` still compute and record the changes that would be made, project link status becomes `"dry-run"`, and the summary header switches to "Silk Sync (dry-run)". Statistics reflect the would-be changes; `aggregateStats` counts a `"dry-run"` link as linked.

---

## Testing Strategy

Vitest with v8 coverage and `pool: "forks"` for Effect-TS compatibility. The suite is 93 tests, and lives in `__test__/` mirroring `src/` — the canonical layout the builder's tsconfig already expects.

Tests are **not** colocated with source. `test-support.ts` moved with them, so `src/` contains only shipped code.

The stated motivation was Turbo build-cache isolation — a test edit should not invalidate the bundle. **That benefit does not follow from the move, and is not realized today.** Measured on this tree: with tests in `__test__/`, appending a line to `__test__/sync/labels.test.ts` still takes `build:prod` from `2 cached, 2 total >>> FULL TURBO` to `0 cached, 2 total`.

Two things defeat it, and neither is about where the files sit:

1. `build:prod`'s `inputs` include `$TURBO_DEFAULT$`, which already covers every non-ignored file in the package. Adding or narrowing explicit globs alongside it cannot subtract anything.
2. More fundamentally, `build:prod` `dependsOn` `types:check`, and `types:check` must cover `__test__` or tests stop being typechecked. A dependency task's hash contributes to the dependent's, so a test edit invalidates `types:check` and therefore `build:prod`, whatever `build:prod`'s own inputs say.

Realizing the benefit needs a task-graph change — e.g. splitting a `src`-only typecheck that gates `build:prod` from a full typecheck that covers tests — which trades a second `tsc` invocation for the cache hit. That is a deliberate decision, not a side effect of moving files, and has not been made. See [Known Follow-ups](#known-follow-ups).

The runner is **plain vitest** (`describe`/`it`/`expect` plus `Effect.runPromise`), **not `@effect/vitest`**. That is a deliberate deferral, not an oversight: the pre-existing suite was the port's only characterization gate, and converting the runner at the same time as the service doubles would have installed a virtual `TestClock` across the whole suite while the thing being verified was the port itself. Moving to `@effect/vitest` is [known follow-up work](#known-follow-ups).

Test doubles come from the services themselves — **there is no `/testing` subpath**. Each service ships `makeTest(overrides?)` / `layerTest(overrides?)`, and an unstubbed member dies naming itself, which is what makes a partial double proof that a test touches nothing it did not stub: `ActionOutputs.layerTest`, `ActionState.layerTest`, `ActionLogger.layerTest`, `ActionEnvironment.layerTest`, `GitHubApp.layerTest`.

`src/test-support.ts` supplies `githubTestLayer`, the shared GitHub stack: recorded responses keyed by route literal through `GitHubClient.layerFixture` (which pages them for real, through the same engine the live client uses), the real `GitHubRepository` / `GitHubIssue` layers over it, and a `Repo`. Only the transport is canned. GraphQL is scripted by document name on top of the fixture, because an unscripted document in `layerFixture` is a *defect* while every GraphQL failure path in `src/sync/projects.ts` is a recovered *failure* — a defect is not catchable by `Effect.catch`, so a fixture-only double would make those paths structurally untestable.

Two further conventions: supply inputs with `ActionInput.layer({ "input-name": "value" })` rather than a bare `ConfigProvider` keyed by the plain name (`ActionInput` owns the `INPUT_` derivation; a provider that does not is a silent false green), and exercise `ConfigFile.read` against a real temp file through `NodeFileSystem.layer`, since the claim there is about the filesystem.

---

## Build Pipeline

### Turbo task graph

```text
types:check -> generate:schema -> build:prod
```

- **`types:check`** — `tsc --noEmit`.
- **`generate:schema`** — runs `lib/scripts/generate-schema.ts` (`JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(SilkConfig))` from `src/schemas.ts`) to produce a draft-07 `silk.config.schema.json`, then `biome format --write`.
- **`build:prod`** — `github-action-builder build`, driven by `action.config.ts`.

### `action.config.ts`

Defines the three build entries (`pre`/`main`/`post`), `minify: true`, an `ignore` list (`xmlbuilder2`, `libxmljs2`, `ajv-formats-draft2019`) and `persistLocal`, which writes a local copy of the built action to `.github/actions/local` for `act` testing.

The `ignore` list is a **safety net whose necessity is unverified**. `@cyclonedx/cyclonedx-library` is still installed transitively (through `@effected/github-actions` -> `@effected/sbom`), but the kit keeps its modules off the default runtime's import graph and the built bundles contain zero bytes of it. The entry may now be dead config; it was kept because removing it was not part of the port's verification budget. See [known follow-ups](#known-follow-ups).

Output: `dist/pre.js` (284 kB), `dist/main.js` (416 kB), `dist/post.js` (284 kB) — down from 468 kB / 487 kB / 468 kB before the `@effected` port. The kit's confinement invariants hold in the bundle: zero occurrences of `azure`, `cyclonedx`, `sigstore` or `xmlbuilder` in any entry.

---

## Known Follow-ups

Carried forward from the `@effected` port, recorded rather than papered over:

- **Adopt `@effect/vitest`.** The suite is still plain vitest. The port moved the doubles, not the runner, deliberately — see [Testing Strategy](#testing-strategy).
- **Re-verify (and probably delete) the `ignore` list in `action.config.ts`.** Confirm each of `xmlbuilder2`, `libxmljs2` and `ajv-formats-draft2019` is still reachable by the bundler before keeping the alias; the bundle evidence suggests none of them are.
- **Decide whether to isolate `build:prod` from test-file edits.** Moving tests to `__test__/` did not achieve this on its own — see [Testing Strategy](#testing-strategy) for the measurement and the two reasons. It needs a `src`-only typecheck gating `build:prod`, separate from the full typecheck that covers `__test__`, at the cost of a second `tsc` run. Worth it only if bundle rebuilds become a real cost; today a cold `build:prod` is under two seconds.

---

## Future Enhancements

- Branch protection / ruleset synchronization
- Repository security settings (vulnerability alerts, secret scanning)
- Drift-detection / audit-only reporting mode
- Configuration inheritance (base + per-repo overrides)
- Multi-org support

---

## Related Documentation

**Port reference:**

- [Effected port parity contract](../../plans/2026-08-04-effected-port-parity-contract.md) — the frozen observable contract, nine deliberate deviations, known-unknowns ledger and post-implementation verification results
- [Effected port API dossier](../../plans/2026-08-04-effected-port-api-dossier.md) — signature-level legacy-to-kit symbol map, verified against the installed packages
- [Effected port plan](../../plans/2026-08-04-effected-port-plan.md) — the sequencing the port followed
- `.claude/plans/oracle/` — the pre-port `src/`, `action.yml` and generated schema, kept as the parity oracle

**API authority:**

- `.repos/effect` — vendored read-only Effect source pinned to `effect@4.0.0-beta.101`
- `.repos/effected` — vendored kit source pinned to `@effected/github-actions@0.5.1`; each package's `CLAUDE.md` is the intended usage, `packages/<name>/src/index.ts` the real export surface

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

**Document Status:** Current — resynced 2026-08-04 against the `@effected/*` port. Service layer is `@effected/github-actions@0.5.1` + `@effected/github@0.2.3` + `@effected/config-file@0.2.1` on `effect@4.0.0-beta.101`; `@savvy-web/github-action-effects` is gone along with `GitHubClientLive`, `GitHubGraphQL`, `ConfigLoader`, `ErrorAccumulator`, `Step.groupStep` and the `/testing` subpath. Route-literal REST, ambient `Repo`, `GitHubError.kind` branching and `Effect.partition` are the new load-bearing patterns; the observable contract (inputs, outputs, `action.yml`, token lifecycle, step summary, per-repo error semantics) is unchanged.
