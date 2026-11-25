---
type: Interface
title: The action's inputs and outputs are a frozen public contract
description: action.yml's inputs (app credentials, config-file, custom-properties and/or repos, five flags) and outputs (results JSON plus four scalars) are what every consuming workflow depends on.
x-okfit-kind: api
resource: ../../action.yml
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [github, release]
sources:
  - id: action-manifest
    resource: ../../action.yml
  - id: inputs
    resource: ../../src/inputs.ts
  - id: schemas
    resource: ../../src/schemas.ts
x-okfit-integrity:
  generated:
    body: 7e1dde614bfe30a5
---

# Action contract

Consumers pin `savvy-web/silk-sync-action@v1`; the `v1` alias tag moves on each stable release.

## Inputs

| Input | Meaning |
| --- | --- |
| `app-client-id`, `app-private-key` | GitHub App credentials, required |
| `config-file` | path to the user config, default `.github/silk.config.json` |
| `custom-properties` | multiline `key=value`; a repository must match all (AND), case-insensitively |
| `repos` | multiline names, bare or `owner/repo` |
| `dry-run` | read everything, write nothing |
| `remove-custom-labels` | delete labels the config does not define |
| `sync-settings`, `sync-projects` | turn those passes on |
| `skip-backfill` | link projects without adding open issues and pull requests |

At least one of `custom-properties` and `repos` is required; `parseInputs` fails with `InvalidInputError` otherwise.[^inputs] Both may be given, and the results union (see [dual discovery](/decisions/dual-discovery.md)).

## Outputs

`results` is JSON whose shape is `ResultsOutput` in `src/schemas.ts`: `success`, `dryRun`, `repos`, `labels`, `settings`, `projects`, `errors`.[^schemas] `success`, `repos-total`, `repos-succeeded` and `repos-failed` are scalar conveniences. The job also gets a step summary.

## Dry run

With `dry-run: true` reads run normally and every write is skipped. Labels and settings still compute and record the changes they would make, a project link records status `"dry-run"` (counted as linked), and the summary header reads "Silk Sync (dry-run)".

## Stability

This contract broke once, at 1.0.0: `app-id` became `app-client-id`, the `log-level` and `skip-token-revoke` inputs were removed (logging is the kit's concern and revocation is unconditional), and the scalar outputs were added. The move onto the `@effected` kit kept `action.yml` byte-for-byte unchanged.[^action-manifest]

[^action-manifest]: `action.yml`
[^inputs]: `src/inputs.ts`
[^schemas]: `src/schemas.ts`
