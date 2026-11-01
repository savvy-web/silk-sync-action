---
"@savvy-web/silk-sync-action": patch
---

## Maintenance

* Upgraded the action to Effect 4.1 and the matching `@effected/*` kit releases. The pre and post steps now supply the signature service that `GitHubApp` requires under Effect 4.1. Inputs, outputs, and the token provision and revoke lifecycle are unchanged, and the bundled `dist/` entries were rebuilt.
