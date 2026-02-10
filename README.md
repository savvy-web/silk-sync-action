# Silk Sync Action

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Synchronize repository labels, settings, and GitHub Projects V2 across an
entire organization from a single JSON config file. Authenticate once with a
GitHub App and let every targeted repo converge to the same standard.

## Features

- Sync labels (create, update, remove) with case-insensitive matching
- Enforce repository settings (merge strategies, branch policies, features)
- Link repositories to GitHub Projects V2 and backfill open issues/PRs
- Discover repos by org custom properties or an explicit list
- Dry-run mode to preview all changes before applying them

## Quick Start

```yaml
- uses: savvy-web/silk-sync-action@v1
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    config-file: .github/silk.config.json
    custom-properties: |
      workflow=standard
```

## Configuration

Create a `silk.config.json` with your desired labels and settings:

```json
{
  "$schema": "https://raw.githubusercontent.com/savvy-web/silk-sync-action/main/silk.config.schema.json",
  "labels": [
    { "name": "bug", "description": "Something isn't working", "color": "d73a4a" }
  ],
  "settings": {
    "delete_branch_on_merge": true,
    "allow_squash_merge": true
  }
}
```

A [JSON schema](./silk.config.schema.json) is provided for editor
autocompletion and validation. See
[`silk.config.example.json`](./silk.config.example.json) for a full example.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `app-id` | Yes | | GitHub App ID for authentication |
| `app-private-key` | Yes | | GitHub App private key (PEM format) |
| `config-file` | Yes | `.github/silk.config.json` | Path to the JSON config file |
| `custom-properties` | No | | Multiline `key=value` pairs for org custom property matching (AND logic) |
| `repos` | No | | Explicit repository names, one per line |
| `dry-run` | No | `false` | Preview changes without applying them |
| `remove-custom-labels` | No | `false` | Remove labels not defined in the config |
| `sync-settings` | No | `true` | Sync repository settings |
| `sync-projects` | No | `true` | Sync project linking and backfill |
| `skip-backfill` | No | `false` | Link repos to projects only, skip adding items |
| `log-level` | No | `info` | Logging verbosity (`info` or `debug`) |
| `skip-token-revoke` | No | `false` | Skip revoking the token in the post step |

## Outputs

| Output | Description |
| --- | --- |
| `token` | Generated GitHub App installation token |

## License

[MIT](./LICENSE)
