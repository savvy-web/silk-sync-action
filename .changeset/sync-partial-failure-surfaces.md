---
"@savvy-web/silk-sync-action": minor
---

## Bug Fixes

A repository whose settings update or project sync failed no longer reports success. `syncRepo` previously determined `success` from repo-read and label errors only, so a settings PATCH rejected by org policy, a failed project link, an unresolved (missing or closed) project, a failed open-issue listing, or a failed project item add all left the repository — and therefore the action's `success` output and step summary — green.

Every one of those failures is now recorded as a structured error on the repository result (`target: "settings"` or `target: "project"`, with an `operation` of `update`, `resolve`, `link`, `list-issues` or `add-item`) and folded into the success determination.

**Behavior change:** runs that previously reported `success: "true"` despite partial failures now report `success: "false"`, and `repos-failed` counts those repositories. Consumers branching on the `success` output will start seeing the truthful value. Dry runs and "already linked" / "already present" outcomes are unaffected — they record no errors.
