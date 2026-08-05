import type { GitHubClient, GitHubIssue, GitHubRepository } from "@effected/github";
import { Effect } from "effect";
import type { DiscoveredRepo, RepoSyncResult, SilkConfig } from "../schemas.js";
import type { ProjectCache } from "./projects.js";
import type { SyncInputs } from "./syncRepo.js";
import { syncRepo } from "./syncRepo.js";

/**
 * Sync every discovered repository, sequentially, collecting every result.
 *
 * @remarks
 * `Effect.partition` is the kit's answer to the legacy `ErrorAccumulator`,
 * which has no successor by design: it runs every effect and never fails.
 * `syncRepo`'s error channel is `never`, so the failure half is statically
 * empty — the destructure documents that rather than hiding it.
 */
export const processRepos = (
	repos: ReadonlyArray<DiscoveredRepo>,
	config: SilkConfig,
	projectCache: ProjectCache,
	inputs: SyncInputs,
): Effect.Effect<ReadonlyArray<RepoSyncResult>, never, GitHubClient | GitHubIssue | GitHubRepository> =>
	Effect.gen(function* () {
		const [, results] = yield* Effect.partition(repos, (repo) =>
			Effect.gen(function* () {
				yield* Effect.logInfo(`Processing ${repo.fullName}`);
				return yield* syncRepo(repo, config, projectCache, inputs);
			}),
		);
		return results;
	});
