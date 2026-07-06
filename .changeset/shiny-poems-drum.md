---
"@savvy-web/silk-sync-action": patch
---

## Dependencies

| Dependency                       | Type          | Action  | From    | To            |
| :------------------------------- | :------------ | :------ | :------ | :------------ |
| @savvy-web/silk                  | devDependency | updated | ^1.3.11 | ^2.0.0        |
| @savvy-web/github-action-builder | devDependency | updated | ^1.0.3  | ^1.1.0        |
| @changesets/cli                  | devDependency | added   | —       | ^3.0.0-next.8 |

`@savvy-web/silk` 2.0.0 brings silk-effects 3.0.0 (changesets v3 `next` engine). `@changesets/cli` is now declared explicitly to satisfy silk's new peer range. No source changes required — this action uses no silk-effects surfaces and the bundled output is unchanged.
