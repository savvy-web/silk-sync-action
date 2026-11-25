---
type: Project
title: silk-sync-action
description: A GitHub Action that applies one central silk.config.json (labels, repository settings, Projects V2 linking) to every repository it discovers in an organization or personal account.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
sources:
  - id: action-manifest
    resource: ../action.yml
  - id: program
    resource: ../src/program.ts
x-okfit-integrity:
  generated:
    body: 6d18e7434965cc33
---

# silk-sync-action

## Purpose

Silk Sync keeps a fleet of GitHub repositories consistent. A workflow points it at a user-owned JSON config (`silk.config.json`, validated against a published JSON Schema) and a way to find repositories, by organization custom properties, an explicit list, or both, and the action makes every discovered repository match: the same labels, the same syncable repository settings, and a link to the GitHub Projects V2 board its custom properties name, with open issues and pull requests backfilled onto it.[^action-manifest] Running it twice produces the same result, and a failure in one repository never stops the others.[^program]

## Boundaries

The action owns only Silk-specific domain logic: discovery, the label/settings/project diff and write, and the run report. Everything cross-cutting comes from the `@effected/*` kit: GitHub App token provisioning and revocation, the typed REST and GraphQL client with its 429/5xx retry and backoff, action inputs, outputs, state, the step log and step-summary markdown. See [the kit decision](/decisions/effected-kit.md).

The user owns the config file and its contents; the action owns its schema (`silk.config.schema.json`, served unversioned from `main`). See [the config interface](/interfaces/config-file.md).

## Non-goals

- No hand-rolled rate limiting or inter-repo sleeps: resilience is the kit client's job.
- No direct `@actions/*` or `@octokit/*` dependencies: octokit is owned by `@effected/github`.
- No branch protection, rulesets, security settings, audit-only mode, config inheritance or multi-org runs today. These are recorded as ideas in [the roadmap](/roadmaps/follow-ups.md), not commitments.

[^action-manifest]: `action.yml`
[^program]: `src/program.ts`
