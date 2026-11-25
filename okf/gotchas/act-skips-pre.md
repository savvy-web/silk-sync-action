---
type: Gotcha
title: An act run fails main on missing token state because act skips pre
description: "act does not run the pre step of a local ./ action, so main dies on the missing githubToken state; that is the harness, not a broken build."
resource: ../../effected.toml
status: draft
stale_after: 2027-02-23T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-25T23:21:22Z
tags: [dx, ci]
sources:
  - id: build-config
    resource: ../../effected.toml
x-okfit-integrity:
  generated:
    body: 07fa6b4ab86988c5
---

# act skips pre

**What you see:** with `[action.persistLocal]` enabled, which writes a local copy to `.github/actions/local` for `act`, an `act` run fails in `main` because the persisted `githubToken` state is missing.[^build-config]

**What you conclude:** the bundle or the token lifecycle is broken.

**What is true:** `act` does not run `pre` for a local `./` action, so no token was ever provisioned. On a real runner `pre` runs first (see [the token lifecycle](/flows/token-lifecycle.md)). Judge the build by `effected action build`'s import check and the test suite, not by an `act` run of `main` alone.

[^build-config]: `effected.toml`
