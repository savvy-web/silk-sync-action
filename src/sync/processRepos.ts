import type { GitHubClient, GitHubGraphQL } from "@savvy-web/github-action-effects";
import { ErrorAccumulator } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import type { DiscoveredRepo, RepoSyncResult, SilkConfig } from "../schemas.js";
import type { ProjectCache } from "./projects.js";
import type { SyncInputs } from "./syncRepo.js";
import { syncRepo } from "./syncRepo.js";

export const processRepos = (
	repos: ReadonlyArray<DiscoveredRepo>,
	config: SilkConfig,
	projectCache: ProjectCache,
	inputs: SyncInputs,
): Effect.Effect<ReadonlyArray<RepoSyncResult>, never, GitHubClient | GitHubGraphQL> =>
	Effect.gen(function* () {
		const result = yield* ErrorAccumulator.forEachAccumulate(repos, (repo) =>
			Effect.gen(function* () {
				yield* Effect.logInfo(`Processing ${repo.fullName}`);
				return yield* syncRepo(repo, config, projectCache, inputs);
			}),
		);
		// syncRepo never fails, so `failures` is always empty; `successes` is every result.
		return result.successes;
	});
