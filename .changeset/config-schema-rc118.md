---
"@savvy-web/silk-sync-action": patch
---

## Bug Fixes

Keeps the published `silk.config.schema.json` as strict as before the Effect `4.0.0-rc.118` upgrade, which would otherwise have loosened it.

* Label `color` keeps its six-digit hex `pattern`, so editors still flag an invalid color
* Config objects stay closed (`additionalProperties: false`), so editors still flag misspelled keys
* Length and pattern constraints now sit directly on each property instead of inside single-entry `allOf` wrappers; what the schema accepts is unchanged
