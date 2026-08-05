---
"@savvy-web/silk-sync-action": minor
---

## Features

### Ported to the `@effected` kit

This action's Effect-based runtime foundation has moved off the deprecated `@savvy-web/github-action-effects@3` package onto `@effected/github-actions`, `@effected/github`, and `@effected/config-file`, running on `effect@4.0.0-beta.101`.

The action's consumer-facing contract is unchanged: all inputs and outputs, the three-phase pre/main/post lifecycle, and the generated `silk.config.schema.json` are identical. No workflow using this action needs to change anything.

### Wider `repos` input parsing

The `repos` input now parses through a shared list parser that is a strict superset of the previous newline-splitting behavior. Every input that worked before still works identically. In addition to one repo per line, the input now also accepts:

* Bullet-prefixed lines (`- owner/repo`)
* Comma-separated values
* A JSON array of strings

## Performance

* Reduced bundled action size: `dist/main.js` from 487 kB to 416 kB, `dist/pre.js` and `dist/post.js` from 468 kB to 284 kB
