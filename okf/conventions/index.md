# Convention

* [Branch on GitHubError.kind, never on the rendered message](error-kind-branching.md) - REST failures are one GitHubError and GraphQL failures one GitHubGraphQLError, each with a kind discriminant; match kind (alreadyExists, notFound, ...) or status, never message text.
* [Tests use each service's own layerTest, real inputs and a real filesystem](test-doubles.md) - Tests live in \_\_test\_\_/ mirroring src/, run on plain vitest, take doubles from each kit service's makeTest/layerTest, supply inputs through ActionInput.layer, and read config from a real temp file.
* [Two phases, one step per unit of work, and never a step inside a group](step-log.md) - program.ts opens the Discovery and Sync phases with ActionLogger.phase, each unit of work is one ActionLogger.step, and steps are never wrapped in logger.group.
