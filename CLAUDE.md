# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

**Silk Sync Action** is a GitHub Action that synchronizes repository settings,
labels, and GitHub Projects V2 linking across a GitHub organization. It reads a
centralized JSON config file (`silk.config.json`) and applies it to discovered
repositories.

Built with **Effect v4** (`effect@4.0.0-beta.98` via `catalog:effect`) on top of
**`@savvy-web/github-action-effects@3`** (the library providing `Action`,
`GitHubClient`, `GitHubGraphQL`, `GitHubToken`, `ActionState`, `ActionOutputs`,
`ConfigLoader`, etc.) and bundled with **`@savvy-web/github-action-builder`**.
Runs as a three-phase `node24` action: `pre` (App token provisioning) ->
`main` (sync) -> `post` (token revocation).

Runtime dependencies are just `effect`, `@effect/platform-node`, and the
library. In v4, `@effect/platform` dissolved into core `effect` (e.g.
`FetchHttpClient` now imports from `effect/unstable/http`), so it is no longer a
dependency. There are no `@actions/*` or `@octokit/*` runtime dependencies — all
GitHub Actions and GitHub API integration goes through
`@savvy-web/github-action-effects`.

**For detailed architecture:** `@.claude/design/silk-sync-action/architecture.md` — Load when modifying sync workflow logic, adding sync capabilities, debugging GitHub API interactions, or understanding the library service layer.

**Effect v4 API authority:** `.repos/effect-smol` — vendored read-only Effect source pinned to `effect@4.0.0-beta.98` (matching `catalog:effect`) with v3→v4 migration notes. Consult when unsure what v4 exports or how an API changed.

## Commands

### Development

```bash
pnpm run lint              # Check code with Biome
pnpm run lint:fix          # Auto-fix lint issues
pnpm run lint:md           # Markdown linting
pnpm run typecheck         # Type-check via Turbo (runs tsgo --noEmit)
pnpm run test              # Run all tests
pnpm run test:watch        # Run tests in watch mode
pnpm run test:coverage     # Run tests with coverage report
```

### Building

```bash
pnpm run build             # Full build pipeline via Turbo
pnpm run build:prod        # Bundle action via github-action-builder (action.config.ts)
pnpm run generate:schema   # Generate silk.config.schema.json from Effect Schema
pnpm run validate          # Validate action.yml via github-action-builder
```

Build pipeline: `types:check` -> `generate:schema` -> `build:prod`

Build entries and the optional-dependency `ignore` list (cyclonedx XML plugins,
pulled in transitively by the library) are configured in `action.config.ts`.

Output: `dist/pre.js`, `dist/main.js`, `dist/post.js` (~487 kB main, ~468 kB pre/post after the v4 slimming) plus `dist/package.json`. The build also persists a local copy under `.github/actions/local/` (for `act` testing); both are committed.

### Running a Single Test

```bash
# Run a specific test file
pnpm vitest run src/schemas.test.ts

# Run tests matching a pattern
pnpm vitest run --reporter=verbose -t "SilkConfig"
```

## Development & Release Cycle

### The `dev` branch convention

All in-progress feature work lands on a long-lived **`dev`** branch, never directly on `main`. `main` always reflects the last released state.

The shared release workflow at `savvy-web/.github/.github/workflows/release.yml` has a matching **`dev` branch**. This repo's own `release.yml` pins `@dev` so it exercises in-progress workflow changes before they reach `main`.

### Flow: `dev` → `main` → release

1. Feature work accumulates on `dev`; merge it into `main` when ready.
2. The push to `main` triggers **Phase 1** — changeset detection creates/updates `changeset-release/main` and the release PR.
3. Pushes to the release branch trigger **Phase 2** validation (build, publish dry-runs, release-notes preview, sticky comment).
4. Merging the release PR triggers **Phase 3** — publishing, Git tags, and a published GitHub release.
5. The published release fires `release-sync.yml`, which closes the loop by resetting `dev` back to `main`.

### `release-sync.yml` — post-release housekeeping

Triggered by `release: [published]` (and `workflow_dispatch` with a `tag` input + `dry-run` for rehearsal). Runs as the GitHub App bot so its pushes can bypass protection and won't recurse (no workflow triggers on tag/`dev` pushes). On a **stable SemVer 2.0.0 release `>= 1.0.0`** (bare `MAJOR.MINOR.PATCH` — no leading `v`, no `-prerelease`, no `+build`) it:

1. Moves (or creates) the **`v<major>`** alias tag (e.g. `v1`) at the released commit.
2. **Hard-resets `dev` to `main` HEAD** — a genuine clobber, so any `dev` commit not yet in `main` is discarded. This is safe by design: `dev` work always lands in `main` before a release.

Each push is guarded: if the remote `v<major>` tag or `dev` already points at its target commit, that push is skipped. Sub-`1.0.0`, prerelease, build-metadata, and non-SemVer tags are ignored (no-op).

## Architecture

### Source Layout

- `action.yml` -- Action manifest (node24 runtime, three-phase execution)
- `action.config.ts` -- Build config (entries + optional-dep `ignore` + persistLocal)
- `src/pre.ts` -- Pre step: `GitHubToken.provision` (token + permission check), save start time
- `src/main.ts` -- Main step: `Action.run(program, { layer: MainLive })`
- `src/post.ts` -- Post step: log duration, `GitHubToken.dispose` (revoke)
- `src/program.ts` -- Main Effect program (discover -> sync -> report -> outputs)
- `src/inputs.ts` -- Input parsing via `Config`/`ActionInput` -> `SilkInputs`
- `src/schemas.ts` -- Effect Schema definitions (SilkConfig, domain types, ResultsOutput)
- `src/errors.ts` -- `Schema.TaggedErrorClass` types (DiscoveryError, InvalidInputError)
- `src/state.ts` -- `ActionState` structs (StartTimeState) + state keys
- `src/layers/app.ts` -- PreLive / MainLive / PostLive layer composition
- `src/github/reads.ts` -- Typed `GitHubClient` REST wrappers (stable operation names)
- `src/discovery/` -- Repository discovery (custom properties + explicit repos, merge)
- `src/sync/` -- Sync orchestration (labels, settings, projects, syncRepo, processRepos)
- `src/reporting/` -- Stats aggregation + step-summary markdown
- `lib/scripts/generate-schema.ts` -- Build-time JSON Schema generator (imports `src/schemas.ts`)
- `silk.config.schema.json` -- Generated JSON Schema for user config files

### Key Patterns

- **Library services**: `GitHubClient` (REST + `paginate`, resilient retry/backoff),
  `GitHubGraphQL` (Projects v2), `GitHubToken` (provision/client/dispose across phases),
  `ConfigLoader.loadJson`, `ActionOutputs`, `ActionState`, all from
  `@savvy-web/github-action-effects`
- **Effect-TS services**: class-based `Context.Service` for DI (with companion
  `*Shape` interfaces), `Layer.mergeAll`/`Layer.provide` for composition
- **Typed errors**: `Schema.TaggedErrorClass` with custom `get message()` getters
- **Entry points**: `Action.run(program, { layer })` (handles runtime, error formatting, exit codes)
- **State passing**: `ActionState.save`/`getOptional` with Schema structs (not `core.saveState`)
- **Per-repo error accumulation**: `ErrorAccumulator.forEachAccumulate`; repo failures are
  recorded in results, never fatal
- **Octokit typing gap**: the org custom-properties endpoint
  (`GET /orgs/{org}/properties/values`) is reached via `octokit.request()` inside a
  `GitHubClient.paginate` wrapper in `src/github/reads.ts` (not a typed REST method)

### Code Quality

- **Biome**: Linting and formatting
- **Commitlint**: Conventional commits with DCO signoff
- **Husky**: pre-commit (lint-staged), commit-msg, pre-push (tests)

### Testing

- **Vitest** with v8 coverage, `pool: "forks"` for Effect-TS compatibility
- Tests colocated as `*.test.ts`; run Effect programs with `Effect.runPromise`
- Use the library's **Test layers** for mocks: `GitHubClientTest`, `GitHubGraphQLTest`,
  `ActionOutputsTest`, `ActionStateTest`, `ActionLoggerTest`, `ConfigLoaderTest`,
  `GitHubAppTest` (from `@savvy-web/github-action-effects/testing`)
- Supply inputs in tests via `ConfigProvider.fromMap` + `Effect.withConfigProvider`
- `GitHubClientTest` keys canned REST responses by the `operation` string passed to
  `client.rest`/`paginate`; `GitHubGraphQLTest` keys by `operation` and records calls

## Conventions

### Imports

- Use `.js` extensions for relative imports (ESM requirement)
- Use `node:` protocol for Node.js built-ins
- Separate type imports: `import type { Foo } from './bar.js'`
- Exception: `lib/scripts/` uses `.ts` extensions (run by Node 24 directly)

### Commits

All commits require:

1. Conventional commit format (feat, fix, chore, etc.)
2. DCO signoff: `Signed-off-by: Name <email>`
