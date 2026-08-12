# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Silk Sync Action** is a GitHub Action that synchronizes repository settings, labels, and GitHub Projects V2 linking across a GitHub organization. It reads a centralized JSON config file (`silk.config.json`) and applies it to discovered repositories.

Built with **Effect v4** (`effect@4.0.0-beta.107` via `catalog:effect`) on top of the **`@effected/*`** kit and bundled with **`@savvy-web/github-action-builder`**. Runs as a three-phase `node24` action: `pre` (App token provisioning) -> `main` (sync) -> `post` (token revocation).

Three kit packages carry the service layer:

| Package | Supplies |
| --- | --- |
| `@effected/github-actions` | `Action.run`, `ActionInput`, `ActionOutputs`, `ActionState`, `ActionEnvironment`, `ActionLogger`, `GitHubToken`, `GitHubMarkdown` |
| `@effected/github` | `GitHubClient` (typed REST + GraphQL), `GitHubApp`, `GitHubRepository`, `GitHubIssue`, `Repo`/`RepoRef`, `GitHubError` |
| `@effected/config-file` | `ConfigFile.read` + `JsonCodec` for `silk.config.json` |

Runtime dependencies are those three plus `effect` and `@effect/platform-node` (a required peer of `@effected/github-actions`). In v4, `@effect/platform` dissolved into core `effect`, so it is not a dependency. There are no `@actions/*` or `@octokit/*` **direct** dependencies — octokit is owned by `@effected/github` so nothing downstream has to.

The action previously ran on `@savvy-web/github-action-effects@3`, which is **deprecated and removed**. `GitHubClientLive`, `GitHubGraphQL`, `ConfigLoader`, `ErrorAccumulator`, `Step.groupStep`, `GithubMarkdown` and the `/testing` subpath's nine `*Test` modules **do not exist** in the kit. See `.claude/plans/2026-08-04-effected-port-api-dossier.md` for the full symbol map.

**For detailed architecture:** `@./.claude/design/silk-sync-action/architecture.md` — Load when modifying sync workflow logic, adding sync capabilities, debugging GitHub API interactions, or understanding the kit service layer.

**Effect v4 API authority:** `.repos/effect` — vendored read-only Effect source pinned to `effect@4.0.0-beta.107` (matching `catalog:effect`) with v3→v4 migration notes. **Kit API authority:** `.repos/effected`, pinned to `@effected/github-actions@0.6.0`; each package's `CLAUDE.md` is the intended usage and `packages/<name>/src/index.ts` is the real export surface. Consult both rather than memory.

## Commands

### Development

```bash
pnpm run lint              # Check code with Biome
pnpm run lint:fix          # Auto-fix lint issues
pnpm run lint:md           # Markdown linting
pnpm run typecheck         # Type-check via Turbo (runs tsc --noEmit)
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

Turbo tasks: `build:prod` and `generate:schema` each `dependsOn` `types:check`, but `generate:schema` is **not** in the build chain — `pnpm run build` runs `types:check` -> `build:prod` only. Regenerate the schema explicitly after editing `src/schemas.ts`.

Build entries and the optional-dependency `ignore` list (cyclonedx's XML and draft-2019 plugins, pulled in transitively by `@effected/github-actions` -> `@effected/sbom`) are configured in `action.config.ts`.

Output: `dist/pre.js`, `dist/main.js`, `dist/post.js` (~414 kB main, ~285 kB pre/post after the `@effected` port — down from 487 kB / 468 kB) plus `dist/package.json`. The kit's confinement invariants hold in the bundle: zero occurrences of `azure`, `cyclonedx`, `sigstore` or `xmlbuilder` in any entry. The build also persists a local copy under `.github/actions/local/` (for `act` testing); both are committed.

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
- `src/inputs.ts` -- Input parsing via `ActionInput` -> `SilkInputs`
- `src/schemas.ts` -- Effect Schema definitions (SilkConfig, domain types, ResultsOutput)
- `src/errors.ts` -- `Schema.TaggedError` types (DiscoveryError, InvalidInputError)
- `src/state.ts` -- `ActionState` structs (StartTimeState) + state keys
- `src/layers/app.ts` -- PreLive / MainLive / PostLive layer composition
- `src/github/reads.ts` -- Route-keyed `GitHubClient` wrappers, resolved against the ambient `Repo`
- `__test__/` -- test suites mirroring `src/`, plus `test-support.ts` (`githubTestLayer`, the shared recorded-response GitHub stack)
- `src/discovery/` -- Repository discovery (custom properties + explicit repos, merge)
- `src/sync/` -- Sync orchestration (labels, settings, projects, syncRepo, processRepos)
- `src/reporting/` -- Stats aggregation + step-summary markdown
- `lib/scripts/generate-schema.ts` -- Build-time JSON Schema generator (imports `src/schemas.ts`)
- `silk.config.schema.json` -- Generated JSON Schema for user config files

### Key Patterns

- **The route is the key**: `client.request("GET /repos/{owner}/{repo}", …)` types both params and response from the literal alone. **No casts, no `octokit.request()` escape hatch, no `operation: string`.** The org custom-properties endpoint (`GET /orgs/{org}/properties/values`) *is* in octokit's paginating route map — the old "typing gap" note was stale. Its one genuine gap is `repository_node_id`, absent from the generated type and recovered by a `Schema.decodeUnknownOption` in `src/github/reads.ts`.
- **`Repo` is resolved per call, never captured**: every wrapper in `src/github/reads.ts` reads `yield* Repo`. There are exactly two `Repo.provide` sites — `src/sync/syncRepo.ts` at the per-repo chain boundary, and `src/discovery/explicit.ts` per candidate name (discovery must provide it before a repo is ambient) — so the sync loop never threads an `(owner, repo)` pair. `syncLabels`/`syncProject` still take `owner`/`repo` strings, but only for log and result text.
- **One error per surface**: `GitHubError` with a `kind` discriminant for REST, `GitHubGraphQLError` for GraphQL. Branch on `kind` (`"alreadyExists"`), never on the rendered message.
- **Entry points**: `Action.run(program, { layer })` composes `ActionRuntime.layer` internally — the platform, HTTP client and workflow-command `Logger` all arrive for free. A layer passed to it must have error channel `never`, hence `Layer.orDie` on `GitHubToken.clientLayer()`.
- **Effect-TS services**: class-based `Context.Service` for DI (with companion `*Shape` interfaces), `Layer.mergeAll`/`Layer.provide` for composition
- **Typed errors**: `Schema.TaggedError` with custom `get message()` getters
- **State passing**: `ActionState.save`/`getOptional` with Schema structs
- **Per-repo error accumulation**: `Effect.partition` (the kit ships no `ErrorAccumulator` successor, deliberately); `syncRepo`'s error channel is `never`, so repo failures are recorded in results and never fatal
- **Step framing**: `logger.group(name, logger.withStep(name, effect))` — the two halves of the legacy `Step.groupStep`

### Code Quality

- **Biome**: Linting and formatting
- **Commitlint**: Conventional commits with DCO signoff
- **Husky**: pre-commit (lint-staged), commit-msg, pre-push (tests)

### Testing

- **Vitest** with v8 coverage, `pool: "forks"` for Effect-TS compatibility. Plain vitest (`describe`/`it`/`expect` + `Effect.runPromise`), **not** `@effect/vitest` — the port moved the doubles, not the runner, deliberately: converting both at once installs a virtual `TestClock` across the suite that was the port's only characterization gate.
- **Tests live in `__test__/`, mirroring `src/`** (`__test__/sync/labels.test.ts` covers `src/sync/labels.ts`) — never colocated, which is the layout the builder's tsconfig already includes. `src/` therefore holds only shipped code. Note this does **not** currently buy build-cache isolation: `build:prod` `dependsOn` `types:check`, `types:check` must cover `__test__`, and a dependency's hash feeds the dependent's, so a test edit still invalidates the bundle. Narrowing `build:prod`'s own `inputs` does nothing about that — measured, not assumed.
- **There is no `/testing` subpath.** Every service ships its own `makeTest(overrides?)` / `layerTest(overrides?)`, and an unstubbed member **dies naming itself** — which is what makes a partial double proof that a test touches nothing it did not stub. `ActionOutputs.layerTest`, `ActionState.layerTest`, `ActionLogger.layerTest`, `ActionEnvironment.layerTest`, `GitHubApp.layerTest`.
- **`__test__/test-support.ts`'s `githubTestLayer`** is the shared GitHub stack: recorded responses keyed by **route literal** through `GitHubClient.layerFixture` (which pages them for real, through the same engine the live client uses), the **real** `GitHubRepository` / `GitHubIssue` layers over it, and a `Repo`. GraphQL is scripted by document name on top, because an unscripted document in `layerFixture` is a **defect** and every GraphQL failure path here is a recovered *failure*.
- **Supply inputs with `ActionInput.layer({ "input-name": "value" })`**, never a bare `ConfigProvider` keyed by the plain name. `ActionInput` owns the `INPUT_` derivation; a provider that does not is a silent false green. `ActionInput.variable(name)` spells the runner variable for the one test that must.
- **`ConfigFile.read` is exercised against a real temp file** through `NodeFileSystem.layer` — the claim is about the filesystem, so a filesystem double would only assert the double.

## Conventions

### Imports

- Use `.js` extensions for relative imports (ESM requirement)
- Use `node:` protocol for Node.js built-ins
- Separate type imports: `import type { Foo } from './bar.js'`
- `lib/scripts/` follows the same `.js`-extension rule; those scripts run through `tsx`, not Node directly

### Commits

All commits require:

1. Conventional commit format (feat, fix, chore, etc.)
2. DCO signoff: `Signed-off-by: Name <email>`
