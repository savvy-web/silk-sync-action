---
"@savvy-web/silk-sync-action": patch
---

## Build System

* Generate `silk.config.schema.json` with `effected schema build`, and gate it in CI with `effected schema check`. The file stays at the same URL and accepts the same configs. It now carries an `$id`, keeps its definitions under `$defs`, and shows the "Silk Sync Configuration" title on the config object itself
