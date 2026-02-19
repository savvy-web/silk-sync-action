# @savvy-web/pnpm-module-template

## 0.1.2

### Features

* [`a64f68e`](https://github.com/savvy-web/silk-sync-action/commit/a64f68e42f250f53fb5152b7e128f31a1695f1b7) Supports @savvy-web/vitest

## 0.1.1

### Patch Changes

* 1938248: ## Features
  * Support for @savvy-web/changesets

* b949191: Update dependencies:

  **Dependencies:**

  * @savvy-web/commitlint: ^0.3.1 → ^0.3.2

* 4f26108: ## Dependencies
  * @savvy-web/lint-staged: ^0.3.2 → ^0.4.0

## 0.1.0

### Minor Changes

* 3f73aed: Initial implementation of the Silk Sync Action, migrated from an inline
  `actions/github-script` workflow to a compiled TypeScript GitHub Action.

  ### Three-phase action execution

  * **Pre step** (`src/pre.ts`): Parses action inputs, generates a GitHub App
    installation token, loads and validates the silk config file, and saves state
    for subsequent steps.
  * **Main step** (`src/main.ts`): Discovers target repositories, syncs labels,
    repository settings, and GitHub Projects V2 linking, then generates console
    and summary reports.
  * **Post step** (`src/post.ts`): Revokes the installation token and logs
    total run duration.

  ### Repository discovery

  Two combinable discovery modes (union):

  * **Custom properties**: Discovers repos via GitHub org custom properties with
    AND logic across multiple key=value pairs.
  * **Explicit repos**: Accepts a multiline list of repository names for personal
    accounts or orgs without custom properties.

  ### Sync capabilities

  * **Labels**: Creates, updates, and optionally removes labels to match config.
    Case-insensitive matching with color and description enforcement.
  * **Settings**: Enforces repository settings (merge strategies, wiki, issues,
    projects, discussions, auto-merge, branch deletion, signoff requirements).
  * **Projects**: Links repositories to GitHub Projects V2 via GraphQL, with
    optional backfill of open issues and pull requests as project items.

  ### Effect-TS architecture

  * Type-safe error handling with `Schema.TaggedError` and error accumulation
    (per-repo failures do not halt the run).
  * Dependency injection via `Context.Tag` services (`GitHubRestClient`,
    `GitHubGraphQLClient`) with `Layer`-based composition.
  * Entry points use `NodeRuntime.runMain` from `@effect/platform-node`.
  * All domain types defined as Effect Schemas with runtime validation.

  ### Build and tooling

  * Bundled with `@vercel/ncc` via `@savvy-web/github-action-builder` producing
    `dist/pre.js`, `dist/main.js`, `dist/post.js`.
  * Turbo build pipeline: `types:check` -> `generate:schema` -> `build:prod`.
  * JSON Schema (`silk.config.schema.json`) generated from Effect Schema at build
    time for config file editor support.
  * `action.yml` validated via `github-action-builder validate`.

  ### Testing

  * 116 tests across 12 test files covering schemas, config loading, input
    parsing, label sync, settings sync, project sync, discovery, rate limiting,
    and reporting.
  * All library modules at 80%+ coverage.

  ### Documentation

  * Full README with usage examples, inputs/outputs tables, and configuration
    guide.
  * Architecture design doc at `.claude/design/silk-sync-action/architecture.md`.
  * CONTRIBUTING.md and SECURITY.md updated for this project.

## 0.0.1

### Patch Changes

* ae454d3: Update dependencies:

  **Dependencies:**

  * @savvy-web/commitlint: ^0.2.0 → ^0.2.1
  * @savvy-web/lint-staged: ^0.1.3 → ^0.2.1
  * @savvy-web/rslib-builder: ^0.11.0 → ^0.12.0
