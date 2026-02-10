# Contributing

Thank you for your interest in contributing! This document provides guidelines
and instructions for development.

## Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [pnpm](https://pnpm.io/) 10.29+

## Development Setup

```bash
# Clone the repository
git clone https://github.com/savvy-web/silk-sync-action.git
cd silk-sync-action

# Install dependencies
pnpm install

# Build the action
pnpm run build

# Run tests
pnpm run test
```

## Project Structure

```text
silk-sync-action/
├── src/
│   ├── main.ts                 # Main step (discovery, sync, reporting)
│   ├── pre.ts                  # Pre step (auth, config, input validation)
│   ├── post.ts                 # Post step (token revocation)
│   └── lib/
│       ├── config/             # Config file loading and validation
│       ├── discovery/          # Repo discovery (custom props + explicit list)
│       ├── github/             # GitHub App authentication
│       ├── rate-limit/         # API rate limit throttling
│       ├── reporting/          # Console and step summary output
│       ├── schemas/            # Effect Schema definitions and errors
│       ├── services/           # REST and GraphQL client services
│       └── sync/               # Label, settings, and project sync logic
├── lib/
│   ├── configs/                # Shared configuration files
│   └── scripts/                # Build and codegen scripts
├── action.yml                  # GitHub Action definition
├── silk.config.schema.json     # JSON Schema for config files
└── silk.config.example.json    # Example configuration
```

## Available Scripts

| Script | Description |
| --- | --- |
| `pnpm run build` | Build the action for distribution |
| `pnpm run test` | Run all tests |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run test:coverage` | Run tests with v8 coverage |
| `pnpm run lint` | Check code with Biome |
| `pnpm run lint:fix` | Auto-fix lint issues |
| `pnpm run typecheck` | Type-check via TypeScript |
| `pnpm run validate` | Validate the GitHub Action bundle |
| `pnpm run generate:schema` | Regenerate the JSON Schema from Effect schemas |

## Code Quality

This project uses:

- **[Biome](https://biomejs.dev/)** for linting and formatting
- **[Commitlint](https://commitlint.js.org/)** for enforcing conventional
  commits
- **[Husky](https://typicode.github.io/husky/)** for Git hooks
- **TypeScript** in strict mode targeting ES2022

### Commit Format

All commits must follow the
[Conventional Commits](https://conventionalcommits.org) specification and
include a DCO signoff:

```text
feat: add new feature

Signed-off-by: Your Name <your.email@example.com>
```

### Pre-commit Hooks

The following checks run automatically:

- **pre-commit**: Runs lint-staged (Biome formatting and linting)
- **commit-msg**: Validates commit message format
- **pre-push**: Runs tests for affected packages

## Testing

Tests use [Vitest](https://vitest.dev) with v8 coverage and the `forks` pool
for Effect-TS compatibility.

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:coverage
```

## TypeScript Conventions

- Strict mode enabled
- ES2022 target with ESNext modules
- Use `.js` extensions for relative imports (ESM requirement)
- Use `node:` protocol for Node.js built-ins
- Separate type imports: `import type { Foo } from './bar.js'`

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `pnpm run test`
5. Run linting: `pnpm run lint:fix`
6. Commit with conventional format and DCO signoff
7. Push and open a pull request

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
