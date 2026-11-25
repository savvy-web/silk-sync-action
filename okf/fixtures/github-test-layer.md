---
type: Fixture
title: githubTestLayer stands in for the GitHub API with recorded responses
description: The shared test stack, with REST responses keyed by route literal through GitHubClient.layerFixture, the real GitHubRepository and GitHubIssue layers over it, a Repo, and GraphQL scripted by document name.
resource: ../../__test__/test-support.ts
status: draft
stale_after: 2027-02-23T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [testing, github]
sources:
  - id: test-support
    resource: ../../__test__/test-support.ts
x-okfit-integrity:
  generated:
    body: dbdaf1d900218353
---

# githubTestLayer

**Stands in for:** the GitHub REST and GraphQL APIs as seen through `@effected/github`'s `GitHubClient`.

**How it is built:** REST responses are hand-recorded payloads keyed by route literal and served by `GitHubClient.layerFixture`, which pages them for real through the same engine the live client uses.[^test-support] The real `GitHubRepository` and `GitHubIssue` layers sit on top, with a `Repo`, so only the transport is canned.

GraphQL is scripted by document name on top of the fixture rather than through `layerFixture`. An unscripted document in `layerFixture` is a defect, but every GraphQL failure path in `src/sync/projects.ts` is a recovered failure, and `Effect.catch` cannot catch a defect, so a fixture-only double would leave those paths untestable.

**When it drifts:** a recorded payload missing a field GitHub now sends (or still carrying one it dropped) lets a test pass against a shape production never sees. `repository_node_id` on the custom-properties route is the known case where the wire and octokit's types already disagree. Refresh payloads from a real response when a route's behaviour changes.

[^test-support]: `__test__/test-support.ts`
