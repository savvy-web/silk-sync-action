---
type: Convention
title: Branch on GitHubError.kind, never on the rendered message
description: "REST failures are one GitHubError and GraphQL failures one GitHubGraphQLError, each with a kind discriminant; match kind (alreadyExists, notFound, ...) or status, never message text."
status: draft
stale_after: 2027-02-23T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [github, dx]
sources:
  - id: projects
    resource: ../../src/sync/projects.ts
  - id: settings
    resource: ../../src/sync/settings.ts
x-okfit-integrity:
  generated:
    body: 64971052d8df1947
---

# Branch on error kind

- Match a GitHub failure on `kind`: `notFound`, `alreadyExists`, `rejected`, `unauthorized`, `rateLimited`, `transport` or `decode`. "Already linked" and "already exists" in `src/sync/projects.ts` are `e.kind === "alreadyExists"`.[^projects]
- Use the REST error's optional `status` only where a status carries meaning a `kind` does not: `syncSettings` special-cases `status === 422`, an org-policy rejection.[^settings]
- Never grep, lowercase or substring-match an error's message. The message is presentation; the kit may reword it in any release.
- Use `operation` and `reason` on the error for log and result text.

[^projects]: `src/sync/projects.ts`
[^settings]: `src/sync/settings.ts`
