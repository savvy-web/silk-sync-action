---
"@savvy-web/silk-sync-action": minor
---

## Dependencies

| Dependency                     | Type          | Action  | From             | To               |
| :----------------------------- | :------------ | :------ | :--------------- | :--------------- |
| effect                         | dependency    | updated | 4.0.0-beta.101   | 4.0.0-beta.107   |
| @effect/platform-node          | dependency    | updated | 4.0.0-beta.101   | 4.0.0-beta.107   |
| @effected/github-actions       | dependency    | updated | 0.5.1            | 0.6.0            |
| @effected/github               | dependency    | updated | 0.2.3            | 0.3.0            |
| @effected/config-file          | dependency    | updated | 0.2.1            | 0.3.0            |
| @savvy-web/github-action-builder | devDependency | updated | 2.2.2          | 2.2.3            |
| @savvy-web/silk                | devDependency | updated | 3.4.0            | 3.5.2            |
| @vitest-agent/plugin           | devDependency | updated | 2.0.13           | 2.0.16           |
| @effected/pnpm-plugin-effect   | config        | updated | 0.3.2            | 0.4.0            |

## Maintenance

Adopts the `effect@4.0.0-beta.107` coordinated release wave. The action's observable contract is unchanged — inputs, outputs, `action.yml`, the three-phase token lifecycle, the step summary and the per-repo error semantics all behave exactly as before.

* Domain errors now use `Schema.TaggedError`, which `beta.107` restored as the name for the construct previously called `Schema.TaggedErrorClass`. `DiscoveryError` and `InvalidInputError` keep identical shapes and messages.
* The published `silk.config.schema.json` names the shared optional-boolean union `OptionalBoolean` instead of leaving it to the compiler-generated key `Union_`. `beta.107` began hoisting any structurally identical anonymous subschema that occurs three or more times into a shared definition, so the repository-settings booleans are now emitted once and referenced by `$ref`. The schema validates exactly the same documents as before — inflating the references yields a byte-identical schema — but the definition key is now stable and meaningful in editor tooltips rather than a generated placeholder that could shift between releases.
