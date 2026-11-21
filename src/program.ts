import { ConfigFile, JsonCodec } from "@effected/config-file";
import { ActionEnvironment, ActionLogger, ActionOutputs } from "@effected/github-actions";
import { Effect } from "effect";
import { discoverRepos } from "./discovery/index.js";
import { parseInputs } from "./inputs.js";
import { aggregateStats } from "./reporting/stats.js";
import { buildSummaryMarkdown } from "./reporting/summary.js";
import { plural } from "./reporting/text.js";
import type { DiscoveredRepo } from "./schemas.js";
import { ResultsOutput, SilkConfig } from "./schemas.js";
import { processRepos } from "./sync/processRepos.js";
import type { ProjectCache } from "./sync/projects.js";
import { resolveProjects } from "./sync/projects.js";

const projectNumbersOf = (repos: ReadonlyArray<DiscoveredRepo>): ReadonlyArray<number> => {
	const set = new Set<number>();
	for (const r of repos) {
		if (r.customProperties["project-tracking"] !== "true") continue;
		const n = Number.parseInt(r.customProperties["project-number"] ?? "", 10);
		if (Number.isFinite(n) && n > 0) set.add(n);
	}
	return [...set];
};

export const program = Effect.gen(function* () {
	const outputs = yield* ActionOutputs;
	const logger = yield* ActionLogger;
	const inputs = yield* parseInputs;
	// The org to sync is the org the workflow runs in. `ActionEnvironment` is the
	// one thing that reads `process.env`, and it is already in `ActionServices`.
	const { repositoryOwner: org } = yield* Effect.flatMap(ActionEnvironment, (env) => env.github);

	const config = yield* ConfigFile.read(inputs.configFile, { schema: SilkConfig, codec: JsonCodec });
	yield* Effect.logInfo(`Config loaded: ${config.labels.length} labels`);

	// The step log: a `phase` is a bold heading, and each unit of work under it is
	// its own `step`, folded on success and unfolded on failure. Steps are never
	// wrapped in a `group`: a step opened inside a group cannot fold.
	const { repos, projectCache } = yield* logger.phase(
		"Discovery",
		Effect.gen(function* () {
			const repos = yield* logger.step("Discover repositories", discoverRepos(org, inputs), {
				summary: (found) => `Discovered ${plural(found.length, "repository", "repositories")}`,
			});
			const projectNumbers = inputs.syncProjects ? projectNumbersOf(repos) : [];
			const projectCache: ProjectCache =
				projectNumbers.length === 0
					? new Map()
					: yield* logger.step("Resolve projects", resolveProjects(org, projectNumbers), {
							summary: (cache) =>
								`Resolved ${[...cache.values()].filter((e) => e.ok).length}/${plural(cache.size, "project")}`,
						});
			return { repos, projectCache };
		}),
	);

	// One step per repository, so each folds or fails on its own.
	const results = yield* logger.phase("Sync", processRepos(repos, config, projectCache, inputs));

	const stats = aggregateStats(results);
	yield* outputs.summary(buildSummaryMarkdown(stats, inputs));

	const failed = results.filter((r) => !r.success);
	const resultsValue = {
		success: failed.length === 0,
		dryRun: inputs.dryRun,
		repos: { total: stats.total, succeeded: stats.succeeded, failed: stats.failed },
		labels: stats.labels,
		settings: stats.settings,
		projects: stats.projects,
		errors: failed.map((r) => ({ repo: `${r.owner}/${r.repo}`, details: r.errors })),
	};
	yield* outputs.setJson("results", resultsValue, ResultsOutput);
	yield* outputs.set("success", String(failed.length === 0));
	yield* outputs.set("repos-total", String(stats.total));
	yield* outputs.set("repos-succeeded", String(stats.succeeded));
	yield* outputs.set("repos-failed", String(stats.failed));

	if (stats.failed > 0) yield* Effect.logWarning(`${stats.failed}/${stats.total} repos had errors`);
}).pipe(
	Effect.catch((error) =>
		Effect.flatMap(ActionOutputs, (outputs) =>
			outputs.setFailed(`Sync failed: ${error instanceof Error ? error.message : String(error)}`),
		),
	),
);
