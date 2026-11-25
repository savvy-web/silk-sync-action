---
type: Interface
title: silk.config.json is validated against an unversioned schema served from main
description: "SilkConfig ({ $schema?, labels, settings }) is the user config's contract, and silk.config.schema.json, generated from it, lives at the repo root because user configs pin its raw main URL."
x-okfit-kind: config
resource: ../../silk.config.schema.json
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [config]
sources:
  - id: schemas
    resource: ../../src/schemas.ts
  - id: schema-config
    resource: ../../lib/scripts/schemastore.config.ts
  - id: settings
    resource: ../../src/sync/settings.ts
x-okfit-integrity:
  generated:
    body: c62ece167fb2970e
---

# Config file

`SilkConfig` is `{ $schema?, labels: LabelDefinition[], settings: RepositorySettings }`.[^schemas] The optional `$schema` exists so a user config can reference the schema without failing validation. `RepositorySettings` names the syncable keys, mirrored by `SYNCABLE_KEYS` in `src/sync/settings.ts`; only those keys are diffed and patched.[^settings]

The action reads the file in `main` with `ConfigFile.read(path, { schema: SilkConfig, codec: JsonCodec })`; a read or decode failure is `ConfigReadError` and fails the run.

## The schema URL

User configs pin:

```text
https://raw.githubusercontent.com/savvy-web/silk-sync-action/main/silk.config.schema.json
```

So the generated document stays unversioned at the repository root: key `silk.config.schema`, `outputDir: "../.."`, flat layout, and the derived `$id` is that URL.[^schema-config] Moving or versioning the file breaks every existing config's editor validation. How it is generated is [the generated-schema decision](/decisions/generated-config-schema.md).

## Name collision

`@effected/github` also exports a `RepositorySettings` type, the whole `GET /repos/{owner}/{repo}` payload. The local one is the config vocabulary; the kit's is deliberately not imported.

[^schemas]: `src/schemas.ts`
[^schema-config]: `lib/scripts/schemastore.config.ts`
[^settings]: `src/sync/settings.ts`
