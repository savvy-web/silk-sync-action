# Log

## 2026-11-25

* Initialized the bundle with the software-project profile
* Added A reversed Effect.partition destructure compiles and silently returns no results
* Added A test-file edit still invalidates the build:prod cache
* Added An act run fails main on missing token state because act skips pre
* Added Branch on GitHubError.kind, never on the rendered message
* Added Build on Effect v4 and the @effected kit, owning only domain logic
* Added Bundles are about 500 kB main and 353 kB pre/post, with no confined packages
* Added Custom-property discovery works only in organizations, and only after an admin sets it up
* Added Discover repositories by custom properties, by explicit list, or both as a union
* Added Every REST call is keyed by its route literal, with no casts
* Added Generate silk.config.schema.json from the SilkConfig Effect Schema
* Added Keep the suite on plain vitest rather than @effect/vitest, for now
* Added Per-repository failures are recorded in results, never fatal, via Effect.partition
* Added Queued follow-ups from the kit port, and candidate sync capabilities
* Added Repo is ambient and resolved per call, provided at exactly two sites
* Added Tests use each service's own layerTest, real inputs and a real filesystem
* Added The JSON Schema lowering silently drops a pattern or inlines every optional boolean
* Added The action's inputs and outputs are a frozen public contract
* Added The effected catalog plugin pins the whole Effect and kit family
* Added Two phases, one step per unit of work, and never a step inside a group
* Added githubTestLayer stands in for the GitHub API with recorded responses
* Added main discovers repositories, syncs each one, then reports
* Added pre provisions the App token, main uses it, post revokes it
* Added silk-sync-action
* Added silk-sync-action is a three-phase node24 GitHub Action
* Added silk.config.json is validated against an unversioned schema served from main
