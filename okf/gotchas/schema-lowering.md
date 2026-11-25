---
type: Gotcha
title: The JSON Schema lowering silently drops a pattern or inlines every optional boolean
description: "Schema.isPattern exports pattern only for a RegExp with the u flag, and without an identifier annotation every optional boolean setting inlines its own boolean | null union."
resource: ../../src/schemas.ts
status: draft
stale_after: 2027-02-23T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [config, compat]
sources:
  - id: schemas
    resource: ../../src/schemas.ts
x-okfit-integrity:
  generated:
    body: e8427615adf1ad52
---

# Schema lowering

Both traps show up as a `silk.config.schema.json` that still validates and still passes `schema:check` locally, so they look like nothing happened.

## Dropped pattern

**What you see:** the `color` property in the generated schema has no `pattern`, and editors accept any string.

**What is true:** `Schema.isPattern` exports `pattern` to JSON Schema only when its RegExp carries the `u` flag. `HexColor` is written `/^[0-9a-fA-F]{6}$/u` for this reason.[^schemas] Runtime validation enforces the pattern either way, so only editor validation degrades.

## Inlined optional booleans

**What you see:** after an edit, every `RepositorySettings` boolean in the schema carries its own `anyOf: [boolean, null]`, and the shared `OptionalBoolean` definition is gone.

**What is true:** the lowering stopped hoisting structurally identical anonymous subschemas in `4.0.0-rc.118`. The shared definition exists only because `OptionalBoolean` is `Schema.optional(Schema.Boolean).annotate({ identifier: "OptionalBoolean" })`. Annotate the `Schema.optional(...)` wrapper, not the inner `Schema.Boolean`, so the union itself carries the name; and reuse `OptionalBoolean` rather than writing `Schema.optional(Schema.Boolean)` inline.

The v4 emitter also renders optional and nullable fields as `anyOf: [T, null]` and Schema checks (min, max, pattern) inline on the node; neither is a bug.

[^schemas]: `src/schemas.ts`
