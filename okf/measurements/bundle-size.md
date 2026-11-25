---
type: Measurement
title: Bundles are about 500 kB main and 353 kB pre/post, with no confined packages
description: "Measured 2026-11-25 on effect 4.1.5 and @effected/github-actions 0.38.1 under rolldown; azure, cyclonedx, sigstore and xmlbuilder each occur zero times in every entry."
status: draft
stale_after: 2027-02-23T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [bundle, performance]
sources:
  - id: build-config
    resource: ../../effected.toml
x-okfit-integrity:
  generated:
    body: e26e4bcc6ff40e54
---

# Bundle size

**Inputs:** `effect@4.1.5`, `@effected/github-actions@0.38.1`, `@effected/github@0.34.1`, `@effected/pnpm-plugin-effected@0.27.4`; `[action.build] minify = true`.[^build-config]

**Method:** `pnpm build` (Turbo `build:prod`, which runs `effected action build`), reading the sizes it prints, then `grep -c` for each of `azure`, `cyclonedx`, `sigstore` and `xmlbuilder` over `dist/*.js`.

**Results (2026-11-25):**

| Entry | Size |
| --- | --- |
| `dist/main.js` | 499.8 KB |
| `dist/pre.js` | 353.2 KB |
| `dist/post.js` | 353.1 KB |

All four confinement strings: 0 occurrences in every entry. That is the kit's confinement invariant holding in this bundle, and it is why `effected.toml` needs no `ignore` list: the rolldown bundle never reaches cyclonedx's optional XML or draft-2019 plugins.

Rolldown bundles were about 65 kB smaller per entry than the earlier rspack bundles, which also reached Node builtins through a `createRequire` shim where rolldown emits static `node:` imports.

The confinement check is a manual grep, not a CI gate; re-run it after any kit bump.

[^build-config]: `effected.toml`
