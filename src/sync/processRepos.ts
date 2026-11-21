import type { GitHubClient, GitHubIssue, GitHubRepository } from "@effected/github";
import { ActionLogger } from "@effected/github-actions";
import { Effect } from "effect";
import { RepoSyncFailure } from "../errors.js";
import { plural } from "../reporting/text.js";
import type { DiscoveredRepo, RepoSyncResult, SilkConfig } from "../schemas.js";
import type { ProjectCache } from "./projects.js";
import type { SyncInputs } from "./syncRepo.js";
import { syncRepo } from "./syncRepo.js";

/**
 * The success line for one repository: what changed, or that nothing did.
 */
export const describeResult = (result: RepoSyncResult): string => {
	const count = (op: string) => result.labels.filter((l) => l.operation === op).length;
	const labels = [
		["created", count("created")],
		["updated", count("updated")],
		["removed", count("removed")],
	]
		.filter(([, n]) => n !== 0)
		.map(([op, n]) => `${n} ${op}`);
	const parts: Array<string> = [];
	if (labels.length > 0) parts.push(`labels ${labels.join(", ")}`);
	if (result.settingChanges.length > 0) parts.push(`${plural(result.settingChanges.length, "setting")} changed`);
	if (result.projectLinkStatus === "linked" || result.projectLinkStatus === "dry-run")
		parts.push(`linked to ${result.projectTitle ?? `project #${result.projectNumber}`}`);
	if (result.itemsAdded > 0) parts.push(`${plural(result.itemsAdded, "item")} added`);
	return `${result.owner}/${result.repo} · ${parts.length > 0 ? parts.join(" · ") : "up to date"}`;
};

/**
 * Sync every discovered repository, sequentially, one `ActionLogger.step` each.
 *
 * @remarks
 * A repository whose result records errors fails its step with a
 * {@link RepoSyncFailure}, so the log marks it `✗` and shows its detail
 * unfolded, and is then recovered straight back into its result: the error
 * channel stays `never` and one bad repository never aborts the run.
 *
 * `Effect.partition` is the kit's answer to the legacy `ErrorAccumulator`,
 * which has no successor by design: it runs every effect and never fails.
 * Since Effect `4.0.0` the tuple is `[passes, fails]`; destructuring the wrong
 * slot still compiles (`never[]` is assignable to the result type) and
 * silently returns nothing, so keep `results` first.
 */
export const processRepos = (
	repos: ReadonlyArray<DiscoveredRepo>,
	config: SilkConfig,
	projectCache: ProjectCache,
	inputs: SyncInputs,
): Effect.Effect<ReadonlyArray<RepoSyncResult>, never, ActionLogger | GitHubClient | GitHubIssue | GitHubRepository> =>
	Effect.gen(function* () {
		const logger = yield* ActionLogger;
		const [results] = yield* Effect.partition(repos, (repo) =>
			logger
				.step(
					repo.fullName,
					syncRepo(repo, config, projectCache, inputs).pipe(
						Effect.flatMap((result) =>
							result.success ? Effect.succeed(result) : Effect.fail(new RepoSyncFailure({ result })),
						),
					),
					{ summary: describeResult },
				)
				.pipe(Effect.catchTag("RepoSyncFailure", (failure) => Effect.succeed(failure.result))),
		);
		return results;
	});
