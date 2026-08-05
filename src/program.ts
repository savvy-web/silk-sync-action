import { ConfigFile, JsonCodec } from "@effected/config-file";
import { ActionEnvironment, ActionLogger, ActionOutputs } from "@effected/github-actions";
import { Effect } from "effect";
import { discoverRepos } from "./discovery/index.js";
import { parseInputs } from "./inputs.js";
import { aggregateStats } from "./reporting/stats.js";
import { buildSummaryMarkdown } from "./reporting/summary.js";
import type { DiscoveredRepo } from "./schemas.js";
import { ResultsOutput, SilkConfig } from "./schemas.js";
import { processRepos } from "./sync/processRepos.js";
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

	// `Step.groupStep` was `group` + `withStep`; the kit exposes the two halves.
	const discovery = discoverRepos(org, inputs);
	const repos = yield* logger.group("Discover repositories", logger.withStep("Discover repositories", discovery));

	const projectNumbers = inputs.syncProjects ? projectNumbersOf(repos) : [];
	const projectCache = yield* resolveProjects(org, projectNumbers);

	const sync = processRepos(repos, config, projectCache, inputs);
	const results = yield* logger.group("Sync repositories", logger.withStep("Sync repositories", sync));

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
