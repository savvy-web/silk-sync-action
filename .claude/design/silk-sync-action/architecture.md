---
status: current
module: silk-sync-action
category: architecture
created: 2026-02-09
updated: 2026-02-09
last-synced: 2026-02-09
completeness: 95
related: []
dependencies: []
implementation-plans:
  - ../plans/silk-sync-action.md
---

# Silk Sync Action - Architecture

GitHub Action that synchronizes repository settings, labels, and project
linking across a GitHub organization (or personal account) using a
centralized configuration file. Built with Effect-TS and
`@savvy-web/github-action-builder`.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [System Architecture](#system-architecture)
5. [Module Structure](#module-structure)
6. [Schemas and Types](#schemas-and-types)
7. [Effect Services](#effect-services)
8. [Data Flow](#data-flow)
9. [Integration Points](#integration-points)
10. [Error Handling](#error-handling)
11. [Testing Strategy](#testing-strategy)
12. [Build Pipeline](#build-pipeline)
13. [Future Enhancements](#future-enhancements)
14. [Related Documentation](#related-documentation)

---

## Overview

The Silk Sync Action enforces organizational consistency across GitHub
repositories. It reads a user-provided JSON configuration file
(validated against a published JSON schema) and applies standardized
labels, repository settings, and GitHub Projects V2 linking to target
repositories.

**Two discovery modes (combinable as union):**

- **Custom properties mode:** Discovers repos via arbitrary GitHub
  custom properties (e.g. `workflow=standard`). Multiple properties
  use AND logic (repo must match all). Requires org-level custom
  properties.
- **Explicit repos mode:** Accepts a multiline list of repository
  names. For personal accounts or orgs without custom properties.

Both modes can be used simultaneously; results are merged and
deduplicated by full repository name (case-insensitive).

**Key Design Principles:**

- **Configuration-driven:** All sync behavior derives from a
  user-provided JSON config file with published JSON schema
- **Dual discovery:** Custom properties and explicit repo lists,
  combinable as union
- **Idempotent:** Running the action multiple times produces the same
  result
- **Rate-limit aware:** Built-in throttling and cooldown for GitHub API
  limits
- **Error accumulating:** Per-repo errors do not halt the run; all
  results are reported
- **Effect-TS powered:** Type-safe errors, dependency injection,
  composable programs

**When to reference this document:**

- When modifying sync workflow logic in `src/`
- When adding new sync capabilities (settings, labels, projects)
- When debugging API rate limit or permission issues
- When understanding the repository discovery mechanism

---

## Current State

### Implementation Status

The action has been fully migrated from an inline `actions/github-script`
workflow to a compiled TypeScript action using
`@savvy-web/github-action-builder` and Effect-TS. All 8 implementation
phases are complete.

**Key implementation files:**

- `src/pre.ts` - Pre step: input validation, token generation, config
  loading
- `src/main.ts` - Main step: discovery, sync orchestration, reporting
- `src/post.ts` - Post step: token revocation, duration logging
- `src/lib/` - Core library modules (schemas, services, sync, etc.)
- `action.yml` - Compiled action manifest (`node24` runtime)
- `lib/scripts/generate-schema.ts` - Build-time JSON Schema generator
- 12 test files covering all modules

### Architecture Summary

Three-phase GitHub Action execution (pre -> main -> post):

- **pre.ts:** Parse and validate all inputs via `@actions/core`. Generate
  a GitHub App installation token using `@octokit/auth-app` and
  `@octokit/request`. Validate the config file against the `SilkConfig`
  Effect Schema. Save token, config, and inputs to `core.saveState()`.
  Fails fast on validation errors before any sync API calls.
- **main.ts:** Retrieve token, config, and inputs from `core.getState()`.
  Create the combined service layer via `makeAppLayer(token)`. Discover
  repos via API. Resolve projects (GraphQL, cached). Process each repo
  with error accumulation. Generate console summary + step summary.
- **post.ts:** Retrieve token and `skipTokenRevoke` from state. Revoke
  the GitHub App installation token (unless `skip-token-revoke` is set).
  Log total duration. Handles missing token gracefully (pre step may
  have failed).

All three entry points use `NodeRuntime.runMain()` from
`@effect/platform-node` to run the Effect program.

---

## Rationale

### Architectural Decisions

#### Decision 1: Compiled TypeScript Action (Migration)

**Context:** The original workflow used inline `actions/github-script`
which grew to 900+ lines with no type safety or testability.

**Chosen:** Compiled TypeScript action via
`@savvy-web/github-action-builder`

**Why:**

- TypeScript type safety with Effect Schema validation
- Unit testable with mock services
- Modular code organization
- Consistent with other Silk actions (pnpm-config-dependency-action)
- `@vercel/ncc` bundling produces single-file dist/main.js

#### Decision 2: Dual Discovery (Org + Personal)

**Context:** The original workflow only supported org custom properties.
Personal accounts cannot use custom properties.

**Chosen:** Support both org discovery (via custom properties) and
explicit repo lists (via `repositories` input).

**Why:**

- Org mode: Self-service, no central manifest, queryable
- Personal mode: Works without org admin access
- Union behavior: Both modes can be combined

#### Decision 3: Effect-TS Service Architecture

**Context:** Need composable, testable API interactions with typed error
handling.

**Chosen:** Effect services for GitHub REST and GraphQL, with
`Context.Tag` for dependency injection.

**Why:**

- Typed error channels (every function declares its failure modes)
- Error accumulation (process all repos, report all failures)
- Dependency injection (mock services for testing via `Layer.succeed`)
- Consistent with pnpm-config-dependency-action patterns

#### Decision 4: User-Provided Config File with Published JSON Schema

**Context:** The action needs label definitions and repository settings.

**Chosen:** User-provided JSON config file with JSON Schema generated
from Effect Schema at build time.

**Why:**

- Maximum flexibility, reusable across orgs
- JSON Schema gives IDE autocompletion (generated via
  `JSONSchema.make(SilkConfig)`)
- Runtime validation uses the same Effect Schema definitions

#### Decision 5: Three-Phase Execution with GitHub App Auth

**Context:** Need org-wide API access for label management, settings
sync, and project operations. Also want to fail fast on invalid config.

**Chosen:** Three-phase execution (pre/main/post) with GitHub App
authentication.

**Why:**

- **pre.ts:** Generates short-lived installation token + validates
  config. Catches errors before any sync work begins.
- **main.ts:** Uses token for all API operations. Clear separation
  between setup and execution.
- **post.ts:** Revokes token for security hygiene. Runs even if main
  fails.

#### Decision 6: `octokit.request()` for Custom Properties Endpoint

**Context:** The Octokit typed methods do not yet expose the
`/orgs/{org}/properties/values` endpoint for custom repository
properties.

**Chosen:** Use `octokit.request("GET /orgs/{org}/properties/values")`
with manual type assertions for the response shape.

**Why:**

- The custom properties API is relatively new and Octokit's typed
  REST methods do not cover it
- `octokit.request()` allows calling any REST endpoint with path
  parameters while still using the authenticated Octokit instance
- Response data is manually typed via `OrgRepoProperty` interface in
  `src/lib/services/types.ts`

#### Decision 7: Service Interface Separation from Implementation

**Context:** Service interfaces, Context.Tags, and raw GitHub data types
need to be importable without pulling in implementation dependencies.

**Chosen:** Separate `src/lib/services/types.ts` from `rest.ts` and
`graphql.ts`.

**Why:**

- Avoids circular imports (consumers import types, not implementations)
- Test helpers can import service interfaces without Octokit dependency
- Clean separation of contract (types.ts) from implementation (rest.ts,
  graphql.ts)

### Constraints

#### Constraint 1: GitHub API Rate Limits

- REST API: 5,000 req/hr per installation
- GraphQL API: 5,000 points/hr
- **Mitigation:** Rate limit checks every 10 repos (REST) and every 3
  backfill pages (GraphQL). 1s delay between repos, 100ms delay between
  backfill items. 60s pause when REST remaining < 50. 30s pause when
  GraphQL remaining < 100.

#### Constraint 2: Custom Properties Availability

- Only available for GitHub Organizations (not personal accounts)
- Requires org admin to configure properties
- **Mitigation:** Dual discovery mode with explicit repo list fallback

#### Constraint 3: Org Administration Permission

- Label management requires `administration:write` on the GitHub App
- Settings sync requires `administration:write`
- **Mitigation:** Document required permissions clearly

---

## System Architecture

### Execution Model

Three-phase Node.js 24 action (pre -> main -> post):

```yaml
runs:
  using: "node24"
  pre: "dist/pre.js"
  main: "dist/main.js"
  post: "dist/post.js"
```

### Action Inputs

**Required:**

| Input | Type | Description |
| :---- | :--- | :---------- |
| `app-id` | string | GitHub App ID for authentication |
| `app-private-key` | string | GitHub App private key (PEM format) |
| `config-file` | string | Path to JSON config file (default: `.github/silk.config.json`) |

**Repository Discovery (at least one required):**

| Input | Type | Default | Description |
| :---- | :--- | :------ | :---------- |
| `custom-properties` | string | -- | Multiline `key=value` pairs for org custom property matching (AND logic) |
| `repos` | string | -- | Multiline list of explicit repo names (one per line) |

Both discovery inputs can be specified simultaneously. Results are
merged as a union and deduplicated by full repo name.

**Sync Options:**

| Input | Type | Default | Description |
| :---- | :--- | :------ | :---------- |
| `dry-run` | boolean | false | Preview changes without applying |
| `remove-custom-labels` | boolean | false | Remove labels not in config defaults |
| `sync-settings` | boolean | true | Sync repository settings |
| `sync-projects` | boolean | true | Sync project linking and backfill |
| `skip-backfill` | boolean | false | Link repos to projects only, skip adding items |
| `log-level` | string | info | Logging verbosity (`info` or `debug`) |
| `skip-token-revoke` | boolean | false | Skip revoking token in post step |

**Action Outputs:**

| Output | Description |
| :----- | :---------- |
| `token` | Generated GitHub App installation token |

**Example usage:**

```yaml
# Organization with custom properties
- uses: savvy-web/silk-sync-action@v1
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    config-file: .github/silk.config.json
    custom-properties: |
      workflow=standard

# Personal account with explicit repos
- uses: savvy-web/silk-sync-action@v1
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    config-file: .github/silk.config.json
    repos: |
      my-repo-1
      my-repo-2
      my-repo-3

# Combined: custom properties + explicit repos (union)
- uses: savvy-web/silk-sync-action@v1
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    config-file: .github/silk.config.json
    custom-properties: |
      workflow=standard
      open-source=true
    repos: |
      special-repo-without-properties
```

### Architecture Diagram

```text
+-------------------------------------------------------------------+
|                      GitHub Actions Runner                         |
|                                                                    |
|  PRE (dist/pre.js) -- NodeRuntime.runMain                          |
|  +---------------------------------------------------------------+ |
|  |  1. Parse + validate all inputs (core.getInput)               | |
|  |  2. Generate GitHub App installation token                    | |
|  |     (@octokit/auth-app + @octokit/request)                    | |
|  |  3. Validate config-file against SilkConfig Effect Schema     | |
|  |  4. Save token + config + inputs to core.saveState()          | |
|  +---------------------------------------------------------------+ |
|                              |                                     |
|                              v                                     |
|  MAIN (dist/main.js) -- NodeRuntime.runMain                        |
|  +---------------------------------------------------------------+ |
|  |  1. Retrieve token + config + inputs from core.getState()     | |
|  |  2. Create service layer: makeAppLayer(token)                 | |
|  |     (GitHubRestClient + GitHubGraphQLClient via Layer.mergeAll)| |
|  |  3. Discover repos (custom properties AND/OR explicit list)   | |
|  |  4. Resolve projects (GraphQL, in-memory cache)               | |
|  |  5. For each repo (sequential, 1s delay):                     | |
|  |     a. Sync labels (create/update/remove)                     | |
|  |     b. Sync settings (diff + PATCH only changed keys)         | |
|  |     c. Link to project (GraphQL)                              | |
|  |     d. Backfill issues/PRs (paginated, 100ms delay)           | |
|  |  6. Generate console summary + step summary (core.summary)    | |
|  +---------------------------------------------------------------+ |
|                              |                                     |
|                              v                                     |
|  POST (dist/post.js) -- NodeRuntime.runMain                        |
|  +---------------------------------------------------------------+ |
|  |  1. Log total duration                                        | |
|  |  2. Revoke installation token (unless skip-token-revoke)      | |
|  +---------------------------------------------------------------+ |
|                                                                    |
|  Services (via Context.Tag + Layer):                               |
|    GitHubRestClient --- labels, settings, discovery, rate limits   |
|    GitHubGraphQLClient --- projects V2 (resolve, link, backfill)   |
|    @actions/core --- inputs, outputs, state, summary               |
+-------------------------------------------------------------------+
```

---

## Module Structure

### Directory Layout

```text
src/
+-- pre.ts                        # Pre: input validation + token + config
+-- main.ts                       # Main: orchestrates full sync
+-- post.ts                       # Post: token revocation + cleanup
+-- lib/
    +-- config/
    |   +-- load.ts               # Load and validate config JSON file
    |   +-- load.test.ts          # Config loading tests
    +-- discovery/
    |   +-- index.ts              # Unified discovery (org + personal)
    |   +-- index.test.ts         # Discovery integration tests
    |   +-- org.ts                # Org custom property discovery
    |   +-- personal.ts           # Explicit repo list discovery
    +-- github/
    |   +-- auth.ts               # GitHub App auth (token gen + revoke)
    +-- rate-limit/
    |   +-- throttle.ts           # Rate limit checking and throttling
    |   +-- throttle.test.ts      # Rate limit tests
    +-- reporting/
    |   +-- console.ts            # Console summary output
    |   +-- console.test.ts       # Console reporting tests
    |   +-- summary.ts            # GitHub Actions step summary
    |   +-- summary.test.ts       # Step summary tests
    +-- schemas/
    |   +-- index.ts              # All Effect Schema definitions
    |   +-- index.test.ts         # Schema round-trip tests
    |   +-- errors.ts             # TaggedError definitions
    |   +-- errors.test.ts        # Error type tests
    +-- services/
    |   +-- types.ts              # Service interfaces + Context.Tags
    |   +-- index.ts              # makeAppLayer (combined layer)
    |   +-- rest.ts               # GitHubRestClient implementation
    |   +-- graphql.ts            # GitHubGraphQLClient implementation
    +-- sync/
    |   +-- index.ts              # Per-repo sync orchestration
    |   +-- index.test.ts         # Sync orchestration tests
    |   +-- labels.ts             # Label sync logic
    |   +-- labels.test.ts        # Label sync tests
    |   +-- settings.ts           # Settings diff and apply
    |   +-- settings.test.ts      # Settings sync tests
    |   +-- projects.ts           # Project resolve, link, backfill
    |   +-- projects.test.ts      # Project sync tests
    +-- inputs.ts                 # Action input parsing
    +-- inputs.test.ts            # Input parsing tests
    +-- logging.ts                # Debug/info logging utilities
    +-- test-helpers.ts           # Mock layer factories for tests
lib/
+-- scripts/
    +-- generate-schema.ts        # Build-time JSON Schema generation
```

### Module Responsibilities

#### `src/pre.ts` - Pre Step

Parses inputs, generates token, validates config, and saves state.
Uses `NodeRuntime.runMain()` from `@effect/platform-node`.

```typescript
const program = Effect.gen(function* () {
  const startTime = Date.now();
  core.saveState("startTime", String(startTime));

  // 1. Parse and validate all inputs
  const inputs = yield* parseInputs;
  core.saveState("inputs", JSON.stringify(inputs));

  // 2. Generate GitHub App installation token
  const tokenInfo = yield* generateInstallationToken(inputs.appId, inputs.appPrivateKey);
  core.saveState("token", tokenInfo.token);
  core.saveState("skipTokenRevoke", String(inputs.skipTokenRevoke));
  core.setSecret(tokenInfo.token);
  core.setOutput("token", tokenInfo.token);

  // 3. Validate config file
  const config = yield* loadAndValidateConfig(inputs.configFile);
  core.saveState("config", JSON.stringify(config));
}).pipe(
  Effect.catchAll((error) =>
    Effect.sync(() => {
      const message = error instanceof Error ? error.message : String(error);
      core.setFailed(`Pre step failed: ${message}`);
    }),
  ),
);

NodeRuntime.runMain(program);
```

**Note:** The pre step validates inputs *first* (fail fast), then generates
the token, then validates the config. This ordering ensures that
obviously-invalid inputs (e.g. missing discovery method) are caught before
any API calls are made.

#### `src/main.ts` - Main Step

Retrieves validated state, discovers repos, and runs the sync engine.
The inner `Effect.gen` is provided the service layer via
`Effect.provide(appLayer)`.

```typescript
const program = Effect.gen(function* () {
  const token = core.getState("token");
  const config: SilkConfig = JSON.parse(core.getState("config"));
  const inputs: ActionInputs = JSON.parse(core.getState("inputs"));
  const org = context.repo.owner;

  const appLayer = makeAppLayer(token);

  yield* Effect.gen(function* () {
    const repos = yield* discoverRepos(org, inputs);
    const projectNumbers = inputs.syncProjects
      ? extractProjectNumbers(repos) : [];
    const projectCache = yield* resolveProjects(org, projectNumbers);
    const results = yield* processRepos(repos, config, projectCache, inputs);

    printConsoleSummary(results, inputs.dryRun);
    yield* Effect.promise(() =>
      writeStepSummary(results, projectCache, inputs.dryRun, ...),
    );
  }).pipe(
    Effect.provide(appLayer),
    Effect.catchAll((error) =>
      Effect.sync(() => core.setFailed(`Main step failed: ${message}`)),
    ),
  );
});

NodeRuntime.runMain(program);
```

**Note:** `extractProjectNumbers()` reads custom properties
(`project-tracking`, `project-number`) from discovered repos to
determine which projects to resolve. This is done in `main.ts` rather
than in the discovery layer.

#### `src/post.ts` - Post Step

Revokes token and logs duration. Handles missing token gracefully.

```typescript
const program = Effect.gen(function* () {
  const startTime = core.getState("startTime");
  if (startTime) {
    const duration = Date.now() - Number.parseInt(startTime, 10);
    core.info(`Total duration: ${(duration / 1000).toFixed(1)}s`);
  }

  const skipRevoke = core.getState("skipTokenRevoke") === "true";
  if (skipRevoke) return;

  const token = core.getState("token");
  if (!token) return;

  yield* revokeInstallationToken(token).pipe(
    Effect.catchAll((e) => {
      core.warning(`Failed to revoke token: ${e.message}`);
      return Effect.void;
    }),
  );
});

NodeRuntime.runMain(program);
```

#### `src/lib/config/load.ts` - Configuration Loader

Loads and validates user-provided config JSON file using Effect Schema.

- Reads file contents via `node:fs/promises.readFile`
- Parses JSON with `JSON.parse`
- Validates via `Schema.decodeUnknownEither(SilkConfigSchema)`
- On validation failure, formats field-level errors using
  `ArrayFormatter.formatErrorSync()` from `effect/ParseResult`
- Returns typed `SilkConfig` object or fails with `ConfigLoadError`

#### `lib/scripts/generate-schema.ts` - JSON Schema Generator

Build-time script that generates `silk.config.schema.json` from the
`SilkConfig` Effect Schema using `JSONSchema.make()`:

```typescript
import { JSONSchema } from "effect";
import { SilkConfig } from "../../src/lib/schemas/index.ts";

const jsonSchema = JSONSchema.make(SilkConfig);
const schemaWithMeta = {
  ...jsonSchema,
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Silk Sync Configuration",
  description: "Configuration for the silk-sync workflow...",
};

await writeFile(OUTPUT_PATH, JSON.stringify(schemaWithMeta, null, "\t"));
```

This script is run as a Turbo task (`generate:schema`) that depends on
`types:check` and is a prerequisite of `build:prod`.

#### `src/lib/discovery/` - Repository Discovery

Two discovery strategies unified through `discoverRepos()`:

- **`org.ts` (`discoverByCustomProperties`):** Queries
  `GET /orgs/{org}/properties/values` via `octokit.request()` (not typed
  Octokit methods, since this endpoint is not yet covered by Octokit
  types). Paginates all repos, then filters by user-specified custom
  property key=value pairs (AND logic, case-insensitive). Maps each
  matching repo to `DiscoveredRepo` with all its custom properties
  stored in a `Record<string, string>`.
- **`personal.ts` (`discoverByExplicitList`):** Validates each repo
  exists via `octokit.rest.repos.get()`. Supports bare names (owner
  inferred from org) or `owner/repo` format. Failed validations are
  logged but do not halt discovery unless all repos fail.
- **`index.ts` (`discoverRepos`):** Combines both strategies. Merges by
  `fullName` (case-insensitive). When duplicates exist, custom
  properties from org discovery take precedence. Fails with
  `DiscoveryError` if zero repos discovered.

**Key implementation detail:** The `DiscoveredRepo` schema includes
`customProperties: Schema.Record({ key: Schema.String, value: Schema.String })`
rather than individual boolean fields like `isStandard` or
`projectTracking`. Project tracking is determined at sync time by
checking the `project-tracking` and `project-number` custom properties.

#### `src/lib/sync/` - Sync Operations

Each sync operation is an independent Effect program:

- **`labels.ts` (`syncLabels`):** Compares existing vs desired labels
  using case-insensitive name matching. Creates missing, updates
  differing (color, description, casing), optionally removes custom.
  Each label operation has its own `Effect.catchAll` for error isolation.
  Returns `{ results: LabelResult[], customLabels: string[] }`.

- **`settings.ts` (`syncSettings`):** Takes the current `GitHubRepo`
  data (already fetched in `processRepo`), iterates through
  `SYNCABLE_KEYS`, diffs each against desired config, and PATCHes only
  changed keys in a single API call. Handles org-enforced 422
  rejections gracefully by logging them as warnings.

- **`projects.ts`:** Contains three public functions:
  - `resolveProjects(org, projectNumbers)` - Resolves all unique
    projects via GraphQL and builds an in-memory `ProjectCache`
    (`Map<number, ProjectCacheEntry>`). Closed projects are cached as
    errors.
  - `syncProject(...)` - Links a repo to a project and optionally
    backfills items. Reads from the pre-built cache.
  - Internal `backfillItems()` - Paginates through open issues/PRs
    (100 per page) via REST, adds each to the project via GraphQL
    `addProjectV2ItemById`. Handles "already exists" gracefully.
    100ms delay between items, GraphQL rate limit check every 3 pages.

- **`index.ts` (`processRepos`):** Processes repos sequentially with
  error accumulation. For each repo: fetches repo data via REST, then
  calls labels -> settings -> project in order. Error accumulation is
  done by catching errors into `SyncErrorRecord[]` within the
  `RepoSyncResult` for each repo. Rate limit check every 10 repos,
  1s delay between repos.

#### `src/lib/rate-limit/throttle.ts` - Rate Limiting

Monitors GitHub API rate limits with separate REST and GraphQL tracking:

- **`checkRestRateLimit()`:** Called every 10 repos. Uses
  `Effect.serviceOption(GitHubRestClient)` to gracefully handle
  cases where the service is not in context. Fetches rate limit via
  `GET /rate_limit`. Pauses 60s when remaining < 50, warns when
  remaining < 100.
- **`checkGraphQLRateLimit()`:** Called every 3 backfill pages. Same
  `Effect.serviceOption` pattern. Pauses 30s when GraphQL remaining
  < 100.
- **Exported constants:** `REST_CHECK_INTERVAL = 10`,
  `GRAPHQL_CHECK_INTERVAL = 3`, `INTER_REPO_DELAY_MS = 1000`,
  `INTER_ITEM_DELAY_MS = 100`.
- **`delay(ms)`:** Simple `Effect.promise` wrapper around `setTimeout`.

**Key pattern:** Both rate limit functions use
`Effect.serviceOption(GitHubRestClient)` rather than
`Effect.flatMap(GitHubRestClient, ...)`. This makes them safe to call
even outside an Effect layer context (they return
`Number.MAX_SAFE_INTEGER` when the service is unavailable).

#### `src/lib/logging.ts` - Logging

Effect-wrapped logging utilities that respect the `log-level` input:

```typescript
export function logDebug(message: string): Effect.Effect<void> {
  return Effect.sync(() => {
    if (isDebugMode()) {
      info(`[DEBUG] ${message}`);   // Visible in action output
    } else {
      debug(message);               // Hidden unless runner debug on
    }
  });
}

export function logDebugState(label: string, state: unknown): Effect.Effect<void> {
  return Effect.sync(() => {
    if (isDebugMode()) {
      info(`[DEBUG] ${label}:`);
      info(JSON.stringify(state, null, 2));
    } else {
      debug(`${label}: ${JSON.stringify(state)}`);
    }
  });
}
```

Both functions return `Effect.Effect<void>` with no error channel,
making them safe to `yield*` anywhere.

#### `src/lib/reporting/` - Reporting

Two reporting targets:

##### `console.ts` - Console Summary

`printConsoleSummary(results, dryRun)` is a synchronous function (not
an Effect) that aggregates stats across all `RepoSyncResult[]` and
prints a formatted summary via `core.info()`:

```text
============================================================
SYNC COMPLETE - SUMMARY
============================================================

Repositories: 12 processed, 11 succeeded, 1 failed

Label Statistics:
  Created: 4
  Updated: 7
  Unchanged: 203
  Custom labels found: 12

Settings Statistics:
  Settings changed: 5
  Repos with drift: 3

Project Statistics:
  Repos linked: 2
  Repos already linked: 6
  Items added: 14
  Items already in project: 89
```

In dry-run mode, the heading changes to "DRY-RUN COMPLETE - SUMMARY"
and verb prefixes change (e.g. "to Created" instead of "Created").

##### `summary.ts` - GitHub Actions Step Summary

`writeStepSummary(...)` is an async function that uses `core.summary`
(the `@actions/core` summary API) to generate a rich markdown step
summary:

1. **Heading** - "Sync Results" or "Dry-Run Sync Results" with
   mode indicator
2. **Overview** - Repos processed/succeeded/failed counts
3. **Label Statistics** - Created/updated/removed totals
4. **Settings Statistics** - Changed count + repos with drift, with
   per-repo settings drift details showing
   `key: "currentValue" -> "desiredValue"` for each changed setting
5. **Project Statistics** - Per-project breakdown with link status
   and backfill counts, plus a details table with columns: Repository,
   Project, Title, Link Status, Backfill, Status
6. **Partial Failures** - Expandable `<details>` per repo with error
   details using `summary.addDetails()`
7. **Custom Labels Detected** - Expandable `<details>` listing
   non-standard labels per repo using `summary.addDetails()`

The summary is written to the GitHub Actions step summary via
`summary.write()` (returns a Promise, wrapped in `Effect.promise()` in
`main.ts`).

---

## Schemas and Types

All domain types use `Schema.Struct` with `typeof X.Type` for
inference (not `Schema.Class`). Errors use `Schema.TaggedError` with
custom `get message()` getters. Schemas are defined in
`src/lib/schemas/index.ts` and errors in `src/lib/schemas/errors.ts`.

### Primitive Schemas

```typescript
import { Schema } from "effect";

export const NonEmptyString = Schema.String.pipe(
  Schema.minLength(1, { message: () => "Value must not be empty" })
);

export const HexColor = Schema.String.pipe(
  Schema.pattern(/^[0-9a-fA-F]{6}$/, {
    message: () => "Must be a 6-digit hex color (e.g. 'd73a4a')",
  })
);

export const LogLevel = Schema.Literal("info", "debug");
export const LabelOperation = Schema.Literal("created", "updated", "removed", "unchanged");
export const ProjectLinkStatus = Schema.Literal("linked", "already", "dry-run", "error", "skipped");
export const SquashMergeTitle = Schema.Literal("PR_TITLE", "COMMIT_OR_PR_TITLE");
export const SquashMergeMessage = Schema.Literal("PR_BODY", "COMMIT_MESSAGES", "BLANK");
```

### Configuration Schema

```typescript
export const LabelDefinition = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
  description: Schema.String.pipe(Schema.maxLength(100)),
  color: HexColor,
});

export const RepositorySettings = Schema.Struct({
  has_wiki: Schema.optional(Schema.Boolean),
  has_issues: Schema.optional(Schema.Boolean),
  // ... 11 more optional settings fields
  allow_auto_merge: Schema.optional(Schema.Boolean),
});

export const SilkConfig = Schema.Struct({
  $schema: Schema.optional(Schema.String),  // allows $schema reference
  labels: Schema.Array(LabelDefinition),
  settings: RepositorySettings,
});

export const decodeSilkConfig = Schema.decodeUnknownEither(SilkConfig);
```

**Note:** `SilkConfig` includes an optional `$schema` field so users
can reference the JSON schema file in their config without validation
errors.

### Discovery Schemas

```typescript
export const DiscoveredRepo = Schema.Struct({
  name: NonEmptyString,
  owner: NonEmptyString,
  fullName: NonEmptyString,
  nodeId: NonEmptyString,
  customProperties: Schema.Record({
    key: Schema.String,
    value: Schema.String,
  }),
});

export const ProjectInfo = Schema.Struct({
  id: NonEmptyString,
  title: NonEmptyString,
  number: Schema.Number.pipe(Schema.positive()),
  closed: Schema.Boolean,
});

export const InstallationToken = Schema.Struct({
  token: NonEmptyString,
  expiresAt: Schema.String,
  installationId: Schema.Number.pipe(Schema.positive()),
  appSlug: Schema.String,
});
```

**Key difference from original design:** `DiscoveredRepo` stores
custom properties as a `Record<string, string>` (a flat map of all
property values from the org) rather than individual boolean fields
like `isStandard` or `projectTracking`. This makes the schema generic
and allows downstream code to inspect any custom property at sync time.

### Result Schemas

```typescript
export const RepoSyncResult = Schema.Struct({
  repo: NonEmptyString,
  owner: NonEmptyString,
  labels: Schema.Array(LabelResult),
  customLabels: Schema.Array(Schema.String),
  settingChanges: Schema.Array(SettingChange),
  settingsApplied: Schema.Boolean,
  projectNumber: Schema.NullOr(Schema.Number),
  projectTitle: Schema.NullOr(Schema.String),
  projectLinkStatus: Schema.NullOr(ProjectLinkStatus),
  itemsAdded: Schema.Number,
  itemsAlreadyPresent: Schema.Number,
  errors: Schema.Array(SyncErrorRecord),
  success: Schema.Boolean,
});
```

**Note:** `RepoSyncResult` does not include an `isStandard` field.
Whether a repo is "standard" is determined by its custom properties at
runtime, not stored in the result schema.

### Error Schemas

All errors use `Schema.TaggedError` with custom `get message()`
getters and computed helper properties:

```typescript
export class GitHubApiError extends Schema.TaggedError<GitHubApiError>()(
  "GitHubApiError",
  {
    operation: NonEmptyString,
    statusCode: Schema.optional(Schema.Number.pipe(Schema.between(100, 599))),
    reason: NonEmptyString,
  },
) {
  get message() {
    const status = this.statusCode ? ` (${this.statusCode})` : "";
    return `GitHub API error${status} during ${this.operation}: ${this.reason}`;
  }
  get isRateLimited(): boolean { return this.statusCode === 429; }
  get isNotFound(): boolean { return this.statusCode === 404; }
  get isValidationFailed(): boolean { return this.statusCode === 422; }
  get isRetryable(): boolean {
    return this.isRateLimited || (this.statusCode !== undefined && this.statusCode >= 500);
  }
}

export class GraphQLError extends Schema.TaggedError<GraphQLError>()(
  "GraphQLError",
  {
    operation: NonEmptyString,
    reason: NonEmptyString,
  },
) {
  get message() {
    return `GraphQL error during ${this.operation}: ${this.reason}`;
  }
  get isAlreadyExists(): boolean {
    return this.reason.includes("already") || this.reason.includes("exists");
  }
}
```

**Note:** `GitHubApiError` uses a `reason` field (not `message`) for the
error description to avoid shadowing the computed `get message()` getter.

**Full error type union:**

```typescript
export type ActionError =
  | InvalidInputError    // Fatal - fails in pre step
  | ConfigLoadError      // Fatal - fails in pre step
  | AuthenticationError  // Fatal - fails in pre step
  | DiscoveryError       // Fatal - no repos found
  | GitHubApiError       // Per-operation
  | GraphQLError         // Per-operation
  | LabelSyncError       // Per-label, non-fatal
  | SettingsSyncError    // Per-repo, non-fatal
  | ProjectSyncError;    // Per-project, non-fatal
```

---

## Effect Services

### Service Interface Separation

Service interfaces and `Context.Tag` definitions live in
`src/lib/services/types.ts`, separate from their implementations.
This avoids circular imports and allows test code to import service
types without pulling in Octokit.

### GitHubRestClient Service

Defined in `src/lib/services/types.ts`, implemented in
`src/lib/services/rest.ts`:

```typescript
export interface GitHubRestClientService {
  readonly getOrgRepoProperties: (org: string) =>
    Effect.Effect<ReadonlyArray<OrgRepoProperty>, GitHubApiError>;
  readonly getRepo: (owner: string, repo: string) =>
    Effect.Effect<GitHubRepo, GitHubApiError>;
  readonly listLabels: (owner: string, repo: string) =>
    Effect.Effect<ReadonlyArray<GitHubLabel>, GitHubApiError>;
  readonly createLabel: (owner: string, repo: string, label: LabelDefinition) =>
    Effect.Effect<void, GitHubApiError>;
  readonly updateLabel: (owner: string, repo: string, currentName: string,
    label: LabelDefinition) => Effect.Effect<void, GitHubApiError>;
  readonly deleteLabel: (owner: string, repo: string, name: string) =>
    Effect.Effect<void, GitHubApiError>;
  readonly updateRepo: (owner: string, repo: string,
    settings: Record<string, unknown>) => Effect.Effect<void, GitHubApiError>;
  readonly listOpenIssues: (owner: string, repo: string, page: number) =>
    Effect.Effect<ReadonlyArray<GitHubIssue>, GitHubApiError>;
  readonly getRateLimit: () =>
    Effect.Effect<RateLimitInfo, GitHubApiError>;
}

export class GitHubRestClient extends Context.Tag("GitHubRestClient")<
  GitHubRestClient, GitHubRestClientService
>() {}
```

**Implementation details (rest.ts):**

- Each method creates a fresh `Octokit` instance with `new Octokit({ auth: token })`
- `getOrgRepoProperties` uses `octokit.request("GET /orgs/{org}/properties/values")`
  instead of typed REST methods because this endpoint lacks Octokit types
- All list endpoints (`listLabels`, `listOpenIssues`, `getOrgRepoProperties`)
  implement manual pagination loops with `per_page: 100`
- Errors are caught and wrapped in `GitHubApiError` via `Effect.tryPromise`
  with a `getStatusCode()` helper that extracts `.status` from Octokit errors

### GitHubGraphQLClient Service

Defined in `src/lib/services/types.ts`, implemented in
`src/lib/services/graphql.ts`:

```typescript
export interface GitHubGraphQLClientService {
  readonly resolveProject: (org: string, projectNumber: number) =>
    Effect.Effect<ProjectInfo, GraphQLError>;
  readonly linkRepoToProject: (projectId: string, repoNodeId: string) =>
    Effect.Effect<void, GraphQLError>;
  readonly addItemToProject: (projectId: string, contentId: string) =>
    Effect.Effect<void, GraphQLError>;
}

export class GitHubGraphQLClient extends Context.Tag("GitHubGraphQLClient")<
  GitHubGraphQLClient, GitHubGraphQLClientService
>() {}
```

**Implementation details (graphql.ts):**

- Uses `octokit.graphql<T>()` for typed GraphQL operations
- Three GraphQL operations defined as string constants:
  `RESOLVE_PROJECT_QUERY`, `LINK_REPO_MUTATION`, `ADD_ITEM_MUTATION`
- `resolveProject` returns null-checked `ProjectInfo` (throws if
  `data.organization.projectV2` is null)
- All errors wrapped in `GraphQLError` via `Effect.tryPromise`

### Combined Layer

```typescript
// src/lib/services/index.ts
export function makeAppLayer(
  token: string
): Layer.Layer<GitHubRestClient | GitHubGraphQLClient> {
  return Layer.mergeAll(
    makeGitHubRestClientLayer(token),
    makeGitHubGraphQLClientLayer(token),
  );
}
```

This combined layer is created once in `main.ts` and provided to the
inner Effect program via `Effect.provide(appLayer)`.

### GitHub API Data Types

Raw GitHub API response types are defined as TypeScript interfaces in
`src/lib/services/types.ts`:

- `GitHubLabel` - `{ id, name, description, color }`
- `GitHubRepo` - Full repo data including all settings fields and
  `node_id`
- `GitHubIssue` - `{ id, node_id, number, title, pull_request? }`
- `OrgRepoProperty` - Custom property values for a repo (includes
  `repository_node_id`)
- `RateLimitInfo` - `{ core: { remaining, reset }, graphql: { remaining, reset } }`

---

## Data Flow

### Main Sync Flow

```text
PRE STEP:
[core.getInput("app-id", { required: true })]
[core.getInput("app-private-key", { required: true })]
[core.getInput("config-file", { required: true })]
      |
      v
[parseInputs] --> ActionInputs (validated)
      |
      v
[generateInstallationToken] --> InstallationToken
      |                         (@octokit/auth-app + @octokit/request)
      v
[loadAndValidateConfig] --> SilkConfig
      |                     (Schema.decodeUnknownEither + ArrayFormatter)
      v
[core.saveState: token, config, inputs, startTime, skipTokenRevoke]

MAIN STEP:
[core.getState: token, config, inputs]
      |
      v
[makeAppLayer(token)] --> Layer<GitHubRestClient | GitHubGraphQLClient>
      |
      v
[discoverRepos(org, inputs)]
  +-- Custom properties: GET /orgs/{org}/properties/values (paginated)
  |   +-- Filter: all key=value pairs match (AND, case-insensitive)
  +-- Explicit repos: GET /repos/{owner}/{repo} for each
  |   +-- Validates existence, gets node_id
  +-- Union + deduplicate by fullName --> DiscoveredRepo[]
      |
      v
[extractProjectNumbers(repos)]
  +-- Read "project-tracking" and "project-number" custom properties
  +-- Return unique project numbers
      |
      v
[resolveProjects(org, projectNumbers)] --> ProjectCache
  +-- For each unique projectNumber:
      +-- GraphQL: organization.projectV2(number) --> ProjectInfo
      +-- Closed projects cached as errors
      |
      v
[processRepos(repos, config, projectCache, inputs)] (sequential)
  |
  For each repo (1s delay between, rate check every 10):
  +-- [getRepo] --> GitHubRepo (for node_id + current settings)
  +-- [syncLabels]
  |   +-- List existing labels (paginated)
  |   +-- For each desired label:
  |   |   +-- Missing --> create (or log [DRY-RUN])
  |   |   +-- Differs --> update color/description/casing (or log)
  |   |   +-- Matches --> skip
  |   +-- If remove-custom-labels: delete non-standard labels
  |
  +-- [syncSettings] (if sync-settings enabled)
  |   +-- Diff SYNCABLE_KEYS against current repo data
  |   +-- PATCH only changed keys (single API call)
  |   +-- Handle 422 (org-enforced) as warning
  |
  +-- [syncProject] (if sync-projects and project-tracking=true)
  |   +-- Link repo via GraphQL linkProjectV2ToRepository
  |   +-- Handle "already linked" gracefully
  |   +-- [backfillItems] (if !skip-backfill)
  |       +-- Paginate issues/PRs (100/page)
  |       +-- addProjectV2ItemById for each (100ms delay)
  |       +-- Handle "already exists" gracefully
  |       +-- GraphQL rate check every 3 pages
      |
      v
[RepoSyncResult[]] --> Aggregate
      |
      v
[printConsoleSummary] --> core.info (synchronous)
[writeStepSummary] --> core.summary.write() (async, via Effect.promise)
[core.setOutput: repos-processed, repos-succeeded, repos-failed]
```

### Rate Limit Flow

```text
[Every 10 repos: checkRestRateLimit()]
      |
      v
[Effect.serviceOption(GitHubRestClient)]
      |
      v
[GET /rate_limit]
      |
      +-- remaining >= 100 --> continue
      +-- remaining >= 50  --> log warning, continue
      +-- remaining < 50   --> pause 60s, then continue

[Every 3 backfill pages: checkGraphQLRateLimit()]
      |
      v
[Effect.serviceOption(GitHubRestClient)]
      |
      v
[GET /rate_limit (graphql resource)]
      |
      +-- remaining >= 100 --> continue
      +-- remaining < 100  --> pause 30s, then continue
```

---

## Integration Points

### External Integrations

#### GitHub REST API

**Authentication:** GitHub App installation token (generated in pre
step via `@octokit/auth-app` and `@octokit/request`)

**Key endpoints:**

| Endpoint | Method | Purpose |
| :------- | :----- | :------ |
| `/orgs/{org}/properties/values` | GET | Discover repos via custom properties (via `octokit.request()`) |
| `/repos/{owner}/{repo}/labels` | GET | List existing labels (paginated) |
| `/repos/{owner}/{repo}/labels` | POST | Create label |
| `/repos/{owner}/{repo}/labels/{name}` | PATCH | Update label |
| `/repos/{owner}/{repo}/labels/{name}` | DELETE | Delete label |
| `/repos/{owner}/{repo}` | GET | Get repo settings + node_id |
| `/repos/{owner}/{repo}` | PATCH | Update repo settings |
| `/repos/{owner}/{repo}/issues` | GET | List open issues/PRs (paginated) |
| `/rate_limit` | GET | Check rate limits |

#### GitHub GraphQL API

**Key operations:**

```graphql
# Resolve project
query ResolveProject($org: String!, $number: Int!) {
  organization(login: $org) {
    projectV2(number: $number) {
      id, title, number, closed
    }
  }
}

# Link repo to project
mutation LinkRepoToProject($projectId: ID!, $repositoryId: ID!) {
  linkProjectV2ToRepository(input: {
    projectId: $projectId, repositoryId: $repositoryId
  }) { repository { id } }
}

# Add item to project
mutation AddItemToProject($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: {
    projectId: $projectId, contentId: $contentId
  }) { item { id } }
}
```

#### GitHub App Authentication

**Flow:**

1. **pre.ts:** Creates `createAppAuth()` from `@octokit/auth-app` with
   `appId`, `privateKey`, and `request` (from `@octokit/request`).
   Authenticates as the app, looks up the installation ID via
   `GET /repos/{owner}/{repo}/installation`, then generates an
   installation token. Also fetches the app slug via `GET /app`
   (with fallback to "unknown" on failure). Saves token to state.
2. **main.ts:** Retrieves token from state, creates Octokit clients.
3. **post.ts:** Revokes token via `DELETE /installation/token` using
   `@octokit/request` directly.

#### GitHub Actions Runtime

- `@actions/core`: `getInput()`, `setOutput()`, `saveState()`,
  `getState()`, `setSecret()`, `setFailed()`, `info()`, `debug()`,
  `warning()`, `summary` (step summary API)
- `@actions/github`: `context.repo.owner`, `context.repo.repo`

### Key Dependencies

| Package | Purpose |
| :------ | :------ |
| `effect` | Schema, Layer, Context, Effect (core Effect-TS) |
| `@effect/platform-node` | `NodeRuntime.runMain` for entry points |
| `@actions/core` | GitHub Actions inputs, outputs, state, summary |
| `@actions/github` | GitHub Actions context (repo owner/name) |
| `@octokit/rest` | GitHub REST API client (typed methods) |
| `@octokit/auth-app` | GitHub App JWT authentication |
| `@octokit/request` | Raw HTTP requests (for untyped endpoints) |
| `@savvy-web/github-action-builder` | `@vercel/ncc` bundling + action validation |

### Required Permissions

For the GitHub App:

| Scope | Level | Purpose |
| :---- | :---- | :------ |
| `administration` | write | Label management, settings sync |
| `issues` | read | List open issues for backfill |
| `contents` | read | Read repo metadata |
| `projects` | write | Link repos, add items to projects |

For the workflow:

```yaml
permissions:
  contents: read
```

---

## Error Handling

### Error Accumulation Strategy

The action uses per-repo and per-operation error catching so that
individual failures do not halt the overall run. The main pattern is
`Effect.catchAll` wrapping each operation to capture errors into
`SyncErrorRecord[]`:

```typescript
// In processRepo: fetch repo data with error capture
const repoData = yield* rest.getRepo(repo.owner, repo.name).pipe(
  Effect.catchAll((e) => {
    errors.push({ target: "repo", operation: "get", error: e.message });
    return Effect.succeed(null);
  }),
);

// In syncLabels: each label operation catches its own errors
yield* rest.createLabel(owner, repo, label).pipe(
  Effect.catchAll((e) =>
    Effect.fail(new LabelSyncError({ label: label.name, operation: "create", reason: e.reason })),
  ),
  Effect.catchAll((e) => {
    info(`  Failed to create "${label.name}": ${e.message}`);
    return Effect.succeed(undefined);
  }),
);

// In syncSettings: handle 422 org-enforced rejections
yield* rest.updateRepo(owner, repo, settingsToApply).pipe(
  Effect.catchAll((e) => {
    if (e.isValidationFailed) {
      info(`  Warning: some settings rejected by org policy (422): ${e.reason}`);
    }
    return Effect.succeed(false);
  }),
);
```

### Error Categories

| Error Type | Severity | Behavior |
| :--------- | :------- | :------- |
| `InvalidInputError` | Fatal | Fail in pre step |
| `ConfigLoadError` | Fatal | Fail in pre step |
| `AuthenticationError` | Fatal | Fail in pre step |
| `DiscoveryError` | Fatal | Fail in main (no repos found) |
| `GitHubApiError (429)` | Transient | Detected via rate limit checks |
| `GitHubApiError (404)` | Per-repo | Log warning, continue |
| `GitHubApiError (422)` | Per-setting | Log org-enforced warning |
| `GraphQLError` | Per-project | Cache error, skip project repos |
| `LabelSyncError` | Per-label | Log error, continue to next label |
| `SettingsSyncError` | Per-repo | Log error, continue to projects |
| `ProjectSyncError` | Per-repo | Log error, continue to next repo |

### Dry-Run Mode

When `dry-run: true`:

- All read operations execute normally (API discovery, label listing,
  settings fetching, project resolution)
- All write operations are skipped (no label creates/updates/deletes,
  no settings patches, no project links, no backfill adds)
- Console logs prefix mutations with `[DRY-RUN] Would ...`
- Results are populated with what would have happened
- Step summary header shows "Dry-Run Sync Results" with mode indicator
- All statistics are populated showing what would change

---

## Testing Strategy

### Test Infrastructure

Tests use a shared `src/lib/test-helpers.ts` module that provides mock
Effect service layers:

```typescript
// Create mock REST layer with selective overrides
export function makeMockRestLayer(overrides: MockRestOverrides = {}): Layer.Layer<GitHubRestClient>

// Create mock GraphQL layer with selective overrides
export function makeMockGraphQLLayer(overrides: MockGraphQLOverrides = {}): Layer.Layer<GitHubGraphQLClient>

// Create combined mock layer
export function makeMockLayer(
  rest?: MockRestOverrides,
  graphql?: MockGraphQLOverrides,
): Layer.Layer<GitHubRestClient | GitHubGraphQLClient>
```

**Default behaviors:**

- `getRepo` returns a `makeDefaultRepo(name)` with sensible defaults
- `listLabels` returns `[]` (empty)
- All mutation methods (`createLabel`, `updateLabel`, etc.) succeed
  with `Effect.void`
- `getRateLimit` returns 5000 remaining for both REST and GraphQL
- `resolveProject` fails with "Not mocked" (must be explicitly overridden)

**Pattern for testing Effect programs with services:**

```typescript
const result = await Effect.runPromise(
  someEffectFunction(args).pipe(
    Effect.provide(makeMockLayer({
      listLabels: () => Effect.succeed([existingLabel]),
    })),
  ),
);
```

### Test Files

| File | Tests |
| :--- | :---- |
| `src/lib/schemas/index.test.ts` | Schema encoding/decoding round-trips |
| `src/lib/schemas/errors.test.ts` | TaggedError `_tag`, `message`, helper properties |
| `src/lib/inputs.test.ts` | Custom property parsing, repo parsing, boolean parsing |
| `src/lib/config/load.test.ts` | Valid/invalid config loading, schema validation errors |
| `src/lib/discovery/index.test.ts` | Unified discovery, deduplication, empty discovery |
| `src/lib/sync/labels.test.ts` | Create/update/remove/unchanged, custom label removal |
| `src/lib/sync/settings.test.ts` | Diff detection, PATCH only changed, 422 handling |
| `src/lib/sync/projects.test.ts` | Project resolution, linking, backfill pagination |
| `src/lib/sync/index.test.ts` | Full repo processing orchestration |
| `src/lib/rate-limit/throttle.test.ts` | Check intervals, pause thresholds |
| `src/lib/reporting/console.test.ts` | Console summary output format |
| `src/lib/reporting/summary.test.ts` | Step summary markdown generation |

### Mocking `@actions/core`

Tests that call code using `@actions/core` (inputs, state, logging) use
`vi.mock("@actions/core")` to mock the module. Input values are
configured per test via `vi.mocked(core.getInput).mockImplementation()`.

---

## Build Pipeline

### Turbo Task Graph

```text
types:check --> generate:schema --> build:prod
```

**`types:check`** - Runs `tsgo --noEmit` (TypeScript native preview
compiler) for type checking.

**`generate:schema`** - Runs `lib/scripts/generate-schema.ts` to
produce `silk.config.schema.json` from the Effect `SilkConfig` schema
using `JSONSchema.make()`. The output is then formatted with
`biome format --write`.

**`build:prod`** - Runs `github-action-builder build` which uses
`@vercel/ncc` to bundle each entry point (`src/pre.ts`, `src/main.ts`,
`src/post.ts`) into single-file outputs at `dist/pre.js`,
`dist/main.js`, `dist/post.js`.

### npm Scripts

```bash
pnpm run build          # Full build via Turbo (types:check -> generate:schema -> build:prod)
pnpm run build:prod     # Just the ncc bundle step
pnpm run generate:schema # Just the JSON Schema generation
pnpm run typecheck      # Turbo types:check
pnpm run test           # Vitest run
pnpm run test:coverage  # Vitest with v8 coverage
pnpm run lint           # Biome check
pnpm run validate       # github-action-builder validate (checks action.yml)
```

---

## Future Enhancements

### Potential Additions

- **Branch protection rule synchronization** - Sync branch protection
  rules from config
- **Ruleset synchronization** - Sync repository rulesets from config
- **Repository security settings** - Vulnerability alerts, secret
  scanning
- **Custom webhook configuration** - Manage webhooks from config
- **Drift detection reporting (audit mode)** - Report-only mode that
  shows drift without applying changes
- **Configuration inheritance** - Base config + per-repo overrides
- **Event-driven mode** - Sync on repo creation events
- **Multi-org support** - Sync across multiple organizations

---

## Related Documentation

**Implementation Plan:**

- [Silk Sync Action Plan](../../plans/silk-sync-action.md) - Completed
  implementation plan with all 8 phases

**Reference Implementation:**

- `pnpm-config-dependency-action` - Same Effect-TS patterns, service
  architecture, and github-action-builder toolchain

**Project Files:**

- `action.yml` - Compiled action manifest (node24 runtime)
- `silk.config.schema.json` - Generated JSON schema for config validation
- `src/pre.ts` - Pre step: input validation + token + config
- `src/main.ts` - Main step: sync orchestration
- `src/post.ts` - Post step: token revocation

**External Design Docs:**

- `/Users/spencer/workspaces/savvy-web/github-readme-private/.claude/design/`
  - `silk-ecosystem/silk-overview.md` - Silk ecosystem architecture
  - `org-workflows/workflow-architecture.md` - Workflow details
  - `org-configuration/org-configuration.md` - Custom properties and labels
  - `github-app/savvy-web-bot.md` - GitHub App permissions

**External Resources:**

- [GitHub REST API - Labels](https://docs.github.com/en/rest/issues/labels)
- [GitHub REST API - Repos](https://docs.github.com/en/rest/repos/repos)
- [GitHub GraphQL - ProjectV2](https://docs.github.com/en/graphql/reference/objects#projectv2)
- [GitHub Custom Properties](https://docs.github.com/en/organizations/managing-organization-settings/managing-custom-properties-for-repositories-in-your-organization)
- [Effect-TS Documentation](https://effect.website)
- [@savvy-web/github-action-builder](https://github.com/savvy-web/github-action-builder)

---

**Document Status:** Current - reflects the fully implemented compiled
TypeScript action. All 8 implementation phases complete. Last synced
with codebase on 2026-02-09.
