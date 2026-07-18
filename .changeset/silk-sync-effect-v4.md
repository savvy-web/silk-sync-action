---
"@savvy-web/silk-sync-action": minor
---

## Refactoring

Migrates the entire action runtime to Effect v4. Schema definitions were rewritten against the v4 API surface — `Schema.Literals` for enumerated unions, `.check(...)` filters in place of `.pipe(Schema.filter)`, and `Schema.TaggedErrorClass` for typed errors. Layer wiring moved to `effect/unstable/http` and `NodeServices.layer`. The build-time JSON Schema generator (`lib/scripts/generate-schema.ts`) was ported to the v4 emitter (`toDocumentDraft07`/`toJsonSchemaDocument`); the generated `silk.config.schema.json` shape shifted accordingly — draft-07 `definitions` + `$ref` with nullable fields expressed as `anyOf[T, null]`. Discovery, sync, and reporting logic are otherwise unchanged. The action's `action.yml` inputs and outputs are unchanged.

## Dependencies

| Dependency | Type | Action | From | To |
| :--------- | :--------------- | :------ | :------- | :------------- |
| effect | dependency | updated | ^3.22.0 | 4.0.0-beta.98 |
| @effect/platform-node | dependency | updated | ^0.96.3 | 4.0.0-beta.98 |
| @effect/platform | dependency | removed | ^0.96.3 | — |
| @savvy-web/github-action-effects | dependency | updated | ^2.4.0 | ^3.0.1 |
| @savvy-web/github-action-builder | devDependency | updated | ^1.1.2 | ^2.0.2 |
| @savvy-web/silk | devDependency | updated | ^2.4.4 | ^3.0.2 |
| @vitest-agent/plugin | devDependency | updated | ^1.1.9 | ^2.0.0 |

`effect` and `@effect/platform-node` now resolve through `catalog:effect`; `@effect/platform` is dropped because its modules moved into `effect` core.

## Build System

Production bundles shrank from ~780 kB to ~487 kB per entry point (`dist/pre.js`, `dist/main.js`, `dist/post.js`). All 43 tests pass; the build is clean.
