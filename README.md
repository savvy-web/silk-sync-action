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
- uses: savvy-web/silk-sync-action@main
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    config-file: .github/silk.config.json
    custom-properties: |
      workflow=standard
```

## Usage

Create a workflow file (e.g. `.github/workflows/silk-sync.yml`) in your
organization's `.github` repository or in any repo where you want to trigger
the sync:

```yaml
name: Silk Sync

on:
  # Run on push to main (when config changes)
  push:
    branches: [main]
    paths:
      - ".github/silk.config.json"

  # Run on a schedule (e.g. daily at 06:00 UTC)
  schedule:
    - cron: "0 6 * * *"

  # Allow manual triggers from the Actions tab
  workflow_dispatch:
    inputs:
      dry-run:
        description: Preview changes without applying them
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  sync:
    name: Sync repositories
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: savvy-web/silk-sync-action@v1
        with:
          app-id: ${{ secrets.APP_ID }}
          app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
          config-file: .github/silk.config.json
          dry-run: ${{ inputs.dry-run || 'false' }}
          custom-properties: |
            workflow=standard
```

### Combining discovery modes

You can use custom properties and explicit repos together. Results are merged
and deduplicated:

```yaml
- uses: savvy-web/silk-sync-action@main
  with:
    app-id: ${{ secrets.SILK_APP_ID }}
    app-private-key: ${{ secrets.SILK_APP_PRIVATE_KEY }}
    config-file: .github/silk.config.json
    custom-properties: |
      workflow=standard
      team=platform
    repos: |
      my-org/my-special-repo
      my-org/legacy-app
```

### Personal accounts

Personal accounts don't support org custom properties. Use the `repos` input
instead:

```yaml
- uses: savvy-web/silk-sync-action@main
  with:
    app-id: ${{ secrets.SILK_APP_ID }}
    app-private-key: ${{ secrets.SILK_APP_PRIVATE_KEY }}
    config-file: .github/silk.config.json
    repos: |
      my-repo-one
      my-repo-two
```

## Configuration

Create a `silk.config.json` with your desired labels and settings. A
[JSON schema](./silk.config.schema.json) is provided for editor autocompletion
and validation.

```json
{
  "$schema": "https://raw.githubusercontent.com/savvy-web/silk-sync-action/main/silk.config.schema.json",
  "labels": [
    { "name": "ai", "description": "AI/ML related features or improvements", "color": "7057ff" },
    { "name": "automated", "description": "Automated changes (bots, scripts, CI)", "color": "0075ca" },
    { "name": "bug", "description": "Something isn't working", "color": "d73a4a" },
    { "name": "breaking", "description": "Introduces breaking changes", "color": "b60205" },
    { "name": "ci", "description": "Continuous integration and deployment", "color": "0e8a16" },
    { "name": "dependencies", "description": "Dependency updates", "color": "0366d6" },
    { "name": "docs", "description": "Documentation improvements", "color": "0075ca" },
    { "name": "duplicate", "description": "Duplicate of another issue or PR", "color": "cfd3d7" },
    { "name": "enhancement", "description": "New feature or request", "color": "a2eeef" },
    { "name": "good first issue", "description": "Good for newcomers", "color": "7057ff" },
    { "name": "help wanted", "description": "Extra attention is needed", "color": "008672" },
    { "name": "invalid", "description": "This doesn't seem right", "color": "e4e669" },
    { "name": "performance", "description": "Performance improvements", "color": "fbca04" },
    { "name": "question", "description": "Further information is requested", "color": "d876e3" },
    { "name": "refactor", "description": "Code refactoring", "color": "0366d6" },
    { "name": "security", "description": "Security-related changes", "color": "d73a4a" },
    { "name": "test", "description": "Testing improvements", "color": "0075ca" },
    { "name": "wontfix", "description": "This will not be worked on", "color": "ffffff" }
  ],
  "settings": {
    "has_wiki": false,
    "has_issues": true,
    "has_projects": true,
    "has_discussions": false,
    "allow_merge_commit": false,
    "allow_squash_merge": true,
    "squash_merge_commit_title": "PR_TITLE",
    "squash_merge_commit_message": "BLANK",
    "allow_rebase_merge": true,
    "allow_update_branch": true,
    "delete_branch_on_merge": true,
    "web_commit_signoff_required": true,
    "allow_auto_merge": true
  }
}
```

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
| `results` | JSON string with sync results (parse with `fromJSON()`) |

The `results` output contains repo counts, label/settings/project statistics,
and per-repo error details:

```json
{
  "success": true,
  "dryRun": false,
  "repos": { "total": 12, "succeeded": 12, "failed": 0 },
  "labels": {
    "created": 4,
    "updated": 2,
    "removed": 0,
    "unchanged": 210,
    "customCount": 3
  },
  "settings": { "changed": 6, "reposWithDrift": 3 },
  "projects": {
    "linked": 2,
    "alreadyLinked": 10,
    "itemsAdded": 5,
    "itemsAlreadyPresent": 42
  },
  "errors": []
}
```

Use it in downstream steps, for example to send a Slack notification:

```yaml
- uses: savvy-web/silk-sync-action@main
  id: silk
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    config-file: .github/silk.config.json
    custom-properties: |
      workflow=standard

- if: fromJSON(steps.silk.outputs.results).repos.failed > 0
  run: echo "::warning::${{ fromJSON(steps.silk.outputs.results).repos.failed }} repos had sync errors"
```

## License

[MIT](./LICENSE)
