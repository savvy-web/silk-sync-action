---
type: Module
title: The effected catalog plugin pins the whole Effect and kit family
description: "@effected/pnpm-plugin-effected is a pnpm config dependency that serves catalog:effected, so effect, @effect/platform-node and every @effected/* package move together on one pin."
x-okfit-kind: config-dependency
resource: ../../pnpm-workspace.yaml
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [deps, compat]
sources:
  - id: workspace
    resource: ../../pnpm-workspace.yaml
  - id: manifest
    resource: ../../package.json
x-okfit-integrity:
  generated:
    body: ff07a6768c7e6482
---

# effected catalog

`pnpm-workspace.yaml` lists `@effected/pnpm-plugin-effected` under `configDependencies`.[^workspace] Every runtime dependency in `package.json`, and `@effected/plugin` among the devDependencies, is written `catalog:effected`, so this one pin decides the `effect` version (exactly `4.1.5` today) and every kit version.[^manifest]

Bumping the pin requires dropping `pnpm-lock.yaml` and reinstalling: the lockfile's first document pins config dependencies independently of the workspace file, so a plain `pnpm install` after a bump keeps the old versions and reports success.

Exactly one `effect` must resolve. Two copies turn every `Context.Service` tag into two distinct tags, and the type errors read like an API change rather than a duplicate.

The vendored read-only trees `.repos/effect` and `.repos/effected` are the API authority for this pin; re-pin them when the catalog moves.

[^workspace]: `pnpm-workspace.yaml`
[^manifest]: `package.json`
