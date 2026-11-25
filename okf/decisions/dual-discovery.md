---
type: Decision
title: Discover repositories by custom properties, by explicit list, or both as a union
description: Org custom properties are self-service but org-only, an explicit list works anywhere, and their union lets a repository be force-included by name.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [github, config]
sources:
  - id: discovery
    resource: ../../src/discovery/index.ts
  - id: custom-properties
    resource: ../../src/discovery/customProperties.ts
  - id: explicit
    resource: ../../src/discovery/explicit.ts
x-okfit-integrity:
  generated:
    body: 03873d5703584bc9
---

# Dual discovery

## Context

Organizations can tag repositories with custom properties (`workflow=standard`), but only organizations have them and only an org admin can configure them. Personal accounts, and orgs that have not set properties up, need another way in.

## Decision

Support both. `custom-properties` matches every listed `key=value` (AND), case-insensitively, over the org's property rows.[^custom-properties] `repos` takes bare names or `owner/repo` and validates each with `getRepo`.[^explicit] When both are given the results union and dedupe by lowercased full name; on a conflict the org-discovered entry, with its custom properties, wins.[^discovery]

`DiscoveredRepo` keeps every custom property as a flat `Record<string, string>` rather than named fields, so project tracking is decided at sync time by reading `project-tracking` and `project-number` from that map.

## Alternatives rejected

- **Custom properties only:** shuts out personal accounts. See [the org-only limitation](/limitations/custom-properties-org-only.md).
- **Explicit list only:** loses self-service; every new repository would need a workflow edit.

[^discovery]: `src/discovery/index.ts`
[^custom-properties]: `src/discovery/customProperties.ts`
[^explicit]: `src/discovery/explicit.ts`
