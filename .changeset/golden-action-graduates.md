---
"@savvy-web/silk-sync-action": major
---

## Breaking Changes

### Input `app-id` renamed to `app-client-id`

The action input previously named `app-id` is now `app-client-id`. Workflows that pass the GitHub App identifier must update their `with:` block.

```yaml
# Before
- uses: savvy-web/silk-sync-action@v0
  with:
    app-id: ${{ secrets.APP_ID }}

# After
- uses: savvy-web/silk-sync-action@v1
  with:
    app-client-id: ${{ secrets.APP_ID }}
```

### Inputs `log-level` and `skip-token-revoke` removed

These inputs are no longer accepted. Remove them from any `with:` block — passing unknown inputs to a GitHub Action does not cause a failure, but the values are now silently ignored.

## Features

### New scalar outputs

Four scalar outputs are now emitted alongside the existing `results` JSON output:

| Output | Type | Description |
| :--- | :--- | :--- |
| `success` | `"true"` / `"false"` | Whether all repositories synced without error |
| `repos-total` | number string | Total repositories discovered |
| `repos-succeeded` | number string | Repositories synced successfully |
| `repos-failed` | number string | Repositories that encountered errors |

```yaml
- id: sync
  uses: savvy-web/silk-sync-action@v1
  with:
    app-client-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}

- name: Check results
  run: echo "Synced ${{ steps.sync.outputs.repos-succeeded }} / ${{ steps.sync.outputs.repos-total }}"
```

### Resilient GitHub API client

The underlying API client now automatically retries on `429` (rate-limit) and `5xx` (server error) responses with exponential backoff. No configuration required.

### GitHub App token lifecycle via `GitHubToken`

Token provisioning, permission verification, and revocation are now managed by `@savvy-web/github-action-effects` v2 `GitHubToken`. The `post` phase revokes the token exactly as before, and the revocation is now skipped automatically if provisioning failed — eliminating the previous `skip-token-revoke` workaround.
