# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

**Silk Sync Action** is a GitHub Action that synchronizes repository settings,
labels, and GitHub Projects V2 linking across a GitHub organization. It reads a
centralized JSON config file (`silk.config.json`) and applies it to discovered
repositories.

Built with **Effect-TS** and **`@savvy-web/github-action-builder`**. Runs as a
three-phase `node24` action: `pre` (auth + validation) -> `main` (sync) ->
`post` (token revocation).

**For detailed architecture:** `@.claude/design/silk-sync-action/architecture.md`
-- Load when modifying sync logic, adding sync capabilities, debugging API
interactions, or understanding the service layer.

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
pnpm run build:prod        # Bundle action via @vercel/ncc
pnpm run generate:schema   # Generate silk.config.schema.json from Effect Schema
pnpm run validate          # Validate action.yml via github-action-builder
```

Build pipeline: `types:check` -> `generate:schema` -> `build:prod`

Output: `dist/pre.js`, `dist/main.js`, `dist/post.js` (~1.2 MB each, ncc bundles)

### Running a Single Test

```bash
# Run a specific test file
pnpm vitest run src/lib/schemas/index.test.ts

# Run tests matching a pattern
pnpm vitest run --reporter=verbose -t "SilkConfig"
```

## Architecture

### Source Layout

- `action.yml` -- Action manifest (node24 runtime, three-phase execution)
- `src/pre.ts` -- Pre step: parse inputs, generate GitHub App token, validate config
- `src/main.ts` -- Main step: discover repos, sync settings/labels/projects, report
- `src/post.ts` -- Post step: revoke token, log duration
- `src/lib/schemas/` -- Effect Schema definitions (SilkConfig, labels, settings, errors)
- `src/lib/services/` -- Effect service interfaces and implementations (REST, GraphQL)
- `src/lib/config/` -- Config file loading and validation
- `src/lib/discovery/` -- Repository discovery (custom properties + explicit repos)
- `src/lib/sync/` -- Sync orchestration (labels, settings, projects)
- `src/lib/reporting/` -- Console and GitHub Actions summary output
- `src/lib/rate-limit/` -- API rate-limit throttling
- `src/lib/github/` -- GitHub App authentication
- `lib/scripts/generate-schema.ts` -- Build-time JSON Schema generator
- `silk.config.schema.json` -- Generated JSON Schema for user config files

### Key Patterns

- **Effect-TS services**: `Context.Tag` for dependency injection,
  `Layer.succeed`/`Layer.mergeAll` for composition
- **Typed errors**: `Schema.TaggedError` with custom `get message()` getters
- **Entry points**: `NodeRuntime.runMain` from `@effect/platform-node`
- **State passing**: `core.saveState`/`core.getState` between action phases
- **Octokit typing gap**: Custom properties endpoint uses `octokit.request()`
  with explicit type annotations (not typed REST methods)

### Code Quality

- **Biome**: Linting and formatting
- **Commitlint**: Conventional commits with DCO signoff
- **Husky**: pre-commit (lint-staged), commit-msg, pre-push (tests)

### Testing

- **Vitest** with v8 coverage, `pool: "forks"` for Effect-TS compatibility
- 12 test files, 116 tests across all library modules
- Mock services via `src/lib/test-helpers.ts`
- Test Effect programs with `Effect.runPromise`

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
