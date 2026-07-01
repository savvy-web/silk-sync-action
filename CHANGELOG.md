# @savvy-web/pnpm-module-template

## 1.0.7

### Dependencies

* [`14b047b`](https://github.com/savvy-web/silk-sync-action/commit/14b047b7425677f020b9038453b22ec773f6cea7) | Dependency | Type | Action | From | To |
  \| :------------------------------- | :------------ | :------ | :----- | :----- |
  \| @savvy-web/github-action-effects | dependency | updated | ^2.3.1 | ^2.3.3 |
  \| @savvy-web/github-action-builder | devDependency | updated | ^0.8.0 | ^1.0.1 |
  \| @savvy-web/silk | devDependency | updated | ^1.3.4 | ^1.3.5 |

## 1.0.6

### Dependencies

* | [`7a5b088`](https://github.com/savvy-web/silk-sync-action/commit/7a5b0887f354372ca254d4b51479e3ac80b06ce4) | Dependency    | Type    | Action | From   | To |
  | :--------------------------------------------------------------------------------------------------------- | :------------ | :------ | :----- | :----- | -- |
  | @savvy-web/github-action-effects                                                                           | dependency    | updated | ^2.3.0 | ^2.3.1 |    |
  | @savvy-web/silk                                                                                            | devDependency | updated | ^1.3.3 | ^1.3.4 |    |

## 1.0.5

### Dependencies

* | [`1517343`](https://github.com/savvy-web/silk-sync-action/commit/1517343414d80b4dd023d518e47a63717a5dd820) | Dependency    | Type    | Action  | From    | To |
  | :--------------------------------------------------------------------------------------------------------- | :------------ | :------ | :------ | :------ | -- |
  | @effect/platform                                                                                           | dependency    | updated | ^0.96.1 | ^0.96.2 |    |
  | effect                                                                                                     | dependency    | updated | ^3.21.3 | ^3.21.4 |    |
  | @savvy-web/github-action-effects                                                                           | dependency    | updated | ^2.1.4  | ^2.3.0  |    |
  | @savvy-web/github-action-builder                                                                           | devDependency | updated | ^0.7.8  | ^0.8.0  |    |
  | @savvy-web/silk                                                                                            | devDependency | updated | ^1.0.0  | ^1.3.3  |    |
  | @savvy-web/vitest                                                                                          | devDependency | updated | ^1.5.0  | ^1.6.0  |    |

## 1.0.4

### Dependencies

* | [`c14eda9`](https://github.com/savvy-web/silk-sync-action/commit/c14eda9b6106a15b29bbcfff2d7ef6d735bce496) | Dependency    | Type    | Action | From   | To |
  | :--------------------------------------------------------------------------------------------------------- | :------------ | :------ | :----- | :----- | -- |
  | @savvy-web/github-action-effects                                                                           | dependency    | updated | ^2.1.3 | ^2.1.4 |    |
  | @savvy-web/github-action-builder                                                                           | devDependency | updated | ^0.7.6 | ^0.7.8 |    |
  | @savvy-web/silk                                                                                            | devDependency | updated | ^0.4.0 | ^0.4.2 |    |
  | @savvy-web/vitest                                                                                          | devDependency | updated | ^1.4.0 | ^1.5.0 |    |

- | [`c87645d`](https://github.com/savvy-web/silk-sync-action/commit/c87645d280260f66c1cc0374db382000e21bd717) | Dependency    | Type    | Action   | From     | To |
  | :--------------------------------------------------------------------------------------------------------- | :------------ | :------ | :------- | :------- | -- |
  | @effect/platform-node                                                                                      | dependency    | updated | ^0.106.0 | ^0.107.0 |    |
  | effect                                                                                                     | dependency    | updated | ^3.21.2  | ^3.21.3  |    |
  | @savvy-web/silk                                                                                            | devDependency | updated | ^0.4.2   | ^1.0.0   |    |

## 1.0.3

### Other

* [`daf4b41`](https://github.com/savvy-web/silk-sync-action/commit/daf4b4138bdd0d5e7f6c5c9b844bb42147d92147) Upgrade to silk-release-action\@v2.

## 1.0.2

### Other

* [`61270e0`](https://github.com/savvy-web/silk-sync-action/commit/61270e044188f8208e9f0433e26073ad1a732758) Upgrade to `@savvy-web/silk` dependency system

## 1.0.1

### Dependencies

* | [`b4e4c93`](https://github.com/savvy-web/silk-sync-action/commit/b4e4c93f3604610999e62abdfd75e1e1fb1800e1) | Dependency    | Type    | Action | From   | To |
  | :--------------------------------------------------------------------------------------------------------- | :------------ | :------ | :----- | :----- | -- |
  | @savvy-web/github-action-effects                                                                           | dependency    | updated | ^2.0.1 | ^2.0.2 |    |
  | @savvy-web/github-action-builder                                                                           | devDependency | updated | ^0.7.1 | ^0.7.2 |    |

## 1.0.0

### Breaking Changes

* [`0a11d7d`](https://github.com/savvy-web/silk-sync-action/commit/0a11d7dea552f1bb5a3b1db6a45d761636cf9034) ### Input `app-id` renamed to `app-client-id`

The action input previously named `app-id` is now `app-client-id`. Workflows that pass the GitHub App identifier must update their `with:` block.

```yaml
# Before
- uses: savvy-web/silk-sync-action@v0
  with:
    app-id: ${{ vars.APP_CLIENT_ID }}

# After
- uses: savvy-web/silk-sync-action@v1
  with:
    app-client-id: ${{ secrets.APP_ID }}
```

### Features

* [`0a11d7d`](https://github.com/savvy-web/silk-sync-action/commit/0a11d7dea552f1bb5a3b1db6a45d761636cf9034) ### New scalar outputs

Four scalar outputs are now emitted alongside the existing `results` JSON output:

| Output            | Type                 | Description                                   |
| :---------------- | :------------------- | :-------------------------------------------- |
| `success`         | `"true"` / `"false"` | Whether all repositories synced without error |
| `repos-total`     | number string        | Total repositories discovered                 |
| `repos-succeeded` | number string        | Repositories synced successfully              |
| `repos-failed`    | number string        | Repositories that encountered errors          |

```yaml
- id: sync
  uses: savvy-web/silk-sync-action@v1
  with:
    app-client-id: ${{ vars.APP_CLIENT_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}

- name: Check results
  run: echo "Synced ${{ steps.sync.outputs.repos-succeeded }} / ${{ steps.sync.outputs.repos-total }}"
```

### Inputs `log-level` and `skip-token-revoke` removed

These inputs are no longer accepted. Remove them from any `with:` block — passing unknown inputs to a GitHub Action does not cause a failure, but the values are now silently ignored.

### Resilient GitHub API client

The underlying API client now automatically retries on `429` (rate-limit) and `5xx` (server error) responses with exponential backoff. No configuration required.

### GitHub App token lifecycle via `GitHubToken`

Token provisioning, permission verification, and revocation are now managed by `@savvy-web/github-action-effects` v2 `GitHubToken`. The `post` phase revokes the token exactly as before, and the revocation is now skipped automatically if provisioning failed — eliminating the previous `skip-token-revoke` workaround.

## 0.1.4

### Dependencies

* | [`612d2b7`](https://github.com/savvy-web/silk-sync-action/commit/612d2b7d624c4964c1bf4f35aa4b893e84c48d72) | Dependency | Type    | Action | From   | To |
  | :--------------------------------------------------------------------------------------------------------- | :--------- | :------ | :----- | :----- | -- |
  | @savvy-web/changesets                                                                                      | dependency | updated | ^0.4.2 | ^0.5.3 |    |
  | @savvy-web/commitlint                                                                                      | dependency | updated | ^0.4.0 | ^0.4.2 |    |
  | @savvy-web/github-action-builder                                                                           | dependency | updated | ^0.2.1 | ^0.4.0 |    |
  | @savvy-web/lint-staged                                                                                     | dependency | updated | ^0.5.0 | ^0.6.1 |    |
  | @savvy-web/vitest                                                                                          | dependency | updated | ^0.2.0 | ^0.2.2 |    |

- | [`bac8b5c`](https://github.com/savvy-web/silk-sync-action/commit/bac8b5cbb4e94a716b478bd4261c181b2a1b608e) | Dependency    | Type    | Action | From   | To |
  | :--------------------------------------------------------------------------------------------------------- | :------------ | :------ | :----- | :----- | -- |
  | @savvy-web/changesets                                                                                      | devDependency | updated | ^0.5.3 | ^0.7.0 |    |
  | @savvy-web/commitlint                                                                                      | devDependency | updated | ^0.4.2 | ^0.4.3 |    |
  | @savvy-web/github-action-builder                                                                           | devDependency | updated | ^0.4.0 | ^0.6.0 |    |
  | @savvy-web/lint-staged                                                                                     | devDependency | updated | ^0.6.1 | ^0.6.4 |    |
  | @savvy-web/vitest                                                                                          | devDependency | updated | ^0.2.2 | ^1.0.1 |    |

## 0.1.3

### Dependencies

* [`2a68201`](https://github.com/savvy-web/silk-sync-action/commit/2a6820132474782317b449d50f2351ae048f12ad) @savvy-web/changesets: ^0.1.1 → ^0.4.1
* @savvy-web/commitlint: ^0.3.3 → ^0.4.0
* @savvy-web/github-action-builder: ^0.1.4 → ^0.2.0
* @savvy-web/lint-staged: ^0.4.5 → ^0.5.0
* @savvy-web/vitest: ^0.1.0 → ^0.2.0

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
