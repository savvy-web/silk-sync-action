---
type: Flow
title: main discovers repositories, syncs each one, then reports
description: "The main program: inputs, config, discovery, project resolution, a per-repository sync step that never fails the run, then the step summary and outputs."
x-okfit-entry: ../../src/program.ts
x-okfit-crosses: [../../src/program.ts, ../../src/inputs.ts, ../../src/discovery/index.ts, ../../src/sync/projects.ts, ../../src/sync/processRepos.ts, ../../src/sync/syncRepo.ts, ../../src/reporting/stats.ts, ../../src/reporting/summary.ts]
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [architecture, github, observability]
sources:
  - id: program
    resource: ../../src/program.ts
  - id: discovery
    resource: ../../src/discovery/index.ts
  - id: sync-repo
    resource: ../../src/sync/syncRepo.ts
  - id: projects
    resource: ../../src/sync/projects.ts
x-okfit-integrity:
  generated:
    body: 5876b51514e95b32
---

# Sync run

1. `parseInputs` builds `SilkInputs`; the owner comes from `ActionEnvironment`.
2. `ConfigFile.read` loads and decodes `SilkConfig` (see [the config interface](/interfaces/config-file.md)).
3. Phase **Discovery**, step **Discover repositories**: `discoverRepos` paginates `GET /orgs/{org}/properties/values` and AND-matches the custom properties, validates each explicit name with `getRepo`, then unions and dedupes by lowercased full name, org properties winning.[^discovery] Nothing found is `DiscoveryError`.
4. Step **Resolve projects**, only when some repository has `project-tracking` `"true"`: `resolveProjects` resolves each distinct `project-number` once by GraphQL into a `ProjectCache`; closed or missing projects are cached as errors.[^projects] An unresolved project logs one warning, marking the step `⚠`.
5. Phase **Sync**: `processRepos` runs repositories sequentially through `Effect.partition`, one `ActionLogger.step` each. `syncRepo` provides `Repo` once, then runs `getRepo`, `syncLabels`, `syncSettings` (when `sync-settings`) and `syncProject` (when `sync-projects` and the repo tracks a project; it links, then backfills open issues and pull requests unless `skip-backfill`).[^sync-repo]
6. `aggregateStats` folds the results into `SyncStats`, which feeds both the step summary (`buildSummaryMarkdown`) and the outputs.[^program]

## Failure modes

- **Fatal:** `InvalidInputError`, `ConfigReadError` and `DiscoveryError` reach the top-level `Effect.catch`, which calls `ActionOutputs.setFailed("Sync failed: <message>")` and succeeds; `Action.run` derives the exit code from that.
- **Per repository:** never fatal. See [per-repository accumulation](/decisions/per-repo-accumulation.md). A repository with errors shows `✗` and its first error on its step line, and counts in `repos-failed`.
- **Settings rejected by org policy:** a REST 422 on the settings PATCH is recorded with a policy-specific message.

[^program]: `src/program.ts`
[^discovery]: `src/discovery/index.ts`
[^sync-repo]: `src/sync/syncRepo.ts`
[^projects]: `src/sync/projects.ts`
