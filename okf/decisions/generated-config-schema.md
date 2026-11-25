---
type: Decision
title: Generate silk.config.schema.json from the SilkConfig Effect Schema
description: "One Schema drives both runtime validation and the published JSON Schema, via effected schema build; schema:check is the CI gate against drift."
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [config, ci]
sources:
  - id: schema-config
    resource: ../../lib/scripts/schemastore.config.ts
  - id: biome
    resource: ../../biome.json
x-okfit-integrity:
  generated:
    body: d5d77cb80cd02ce4
---

# Generated config schema

## Context

Users want editor autocompletion for `silk.config.json`, and the action must validate the same file at runtime. Two hand-maintained definitions would drift.

## Decision

`lib/scripts/schemastore.config.ts` is an `effected schema` config that derives `silk.config.schema.json` from `SilkConfig`.[^schema-config] `pnpm run schema:build` writes it, Turbo runs it before `build:prod`, and `schema:check` (the same walk, no writes, run by `ci:test`) fails CI when the committed file is stale. `@effected/schemastore` lowers to Draft-07 with closed objects (`additionalProperties: false`), lints the result and checks it under ajv strict mode. Definitions sit under `$defs` with a root `$ref`, and the root title and description arrive through `rootAnnotations`, which places them on the `SilkConfig` definition because Draft-07 ignores siblings of a root `$ref`.

A `biome.json` override sets `expand: "always"` on the schema file so Biome's formatting agrees with the writer's.[^biome] The schema's location is fixed by [the config interface](/interfaces/config-file.md). The lowering has two traps, in [the schema-lowering gotcha](/gotchas/schema-lowering.md).

## Alternatives rejected

- **A hand-rolled generator:** the earlier approach. Replacing it reshaped the file (`definitions` became `$defs`, an `$id` was added, the title moved onto the definition) without changing what it accepts.
- **A hand-written JSON Schema:** drifts from the runtime decoder.

[^schema-config]: `lib/scripts/schemastore.config.ts`
[^biome]: `biome.json`
