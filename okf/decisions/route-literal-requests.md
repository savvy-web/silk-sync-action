---
type: Decision
title: Every REST call is keyed by its route literal, with no casts
description: "client.request and client.paginate take literals like GET /repos/{owner}/{repo}, which type both params and response; the one untyped field is recovered by a Schema decode, never a cast."
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [github, dx]
sources:
  - id: reads
    resource: ../../src/github/reads.ts
x-okfit-integrity:
  generated:
    body: f3cb9d7f0ac51bf2
---

# Route-literal requests

## Context

The previous library addressed calls by stringly-typed `operation` names and fell back to `octokit.request()` with casts where its types ran out.

## Decision

All REST goes through `src/github/reads.ts` as `client.request(<route>, params)` or `client.paginate(<route>, params)`.[^reads] The literal types the parameters and the response, so there are no casts, no `octokit.request()` escape hatch and no `operation: string`. Writes go through the kit's `RepositoryPatch`, so patching a key the endpoint does not accept is a compile error.

`GET /orgs/{org}/properties/values` is in octokit's paginating route map; an old note calling it a typing gap was wrong. Its one real gap is `repository_node_id`, which GitHub sends but the generated type omits; `reads.ts` recovers it with `Schema.decodeUnknownOption` so the read stays total and cast-free. Raw response shapes used locally (`RepoSnapshot`, `RepoLabel`, `OrgRepoProperty`) are plain TypeScript interfaces, since they describe API responses rather than validated domain data.

Before honoring any "the types don't cover this" claim, compile a probe: that claim was false here once.

## Alternatives rejected

- **`octokit.request()` with casts:** untyped at exactly the calls most likely to change.

[^reads]: `src/github/reads.ts`
