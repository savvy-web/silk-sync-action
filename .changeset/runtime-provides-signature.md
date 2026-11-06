---
"@savvy-web/silk-sync-action": patch
---

## Refactoring

* Rely on the action runtime for the `Signature` service that signs the GitHub App JWT, instead of wiring it by hand. Token provisioning and revocation behave as before
