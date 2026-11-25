---
type: Limitation
title: Custom-property discovery works only in organizations, and only after an admin sets it up
description: "On a personal account, or an org without the named custom properties, custom-properties discovery finds nothing; use repos instead or alongside."
x-okfit-bounds: ../interfaces/action-contract.md
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [github, config]
sources:
  - id: custom-properties
    resource: ../../src/discovery/customProperties.ts
x-okfit-integrity:
  generated:
    body: adeb79d122eeb75b
---

# Custom properties are org-only

**Condition:** the workflow passes `custom-properties` for a personal account, or for an organization where no admin has defined those properties or set them on repositories.

**Symptom:** discovery by properties returns no repositories. With no `repos` input as well, the run fails with `DiscoveryError`.[^custom-properties]

**Why it is acceptable:** GitHub exposes custom properties only on organizations, and only org admins can configure them. The explicit `repos` input covers every other case, and the two union (see [dual discovery](/decisions/dual-discovery.md)).

[^custom-properties]: `src/discovery/customProperties.ts`
