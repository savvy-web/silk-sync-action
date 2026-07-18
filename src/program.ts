import { ActionOutputs, ConfigLoader, GitHubClient, Step } from "@savvy-web/github-action-effects";
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
	const inputs = yield* parseInputs;
	const { owner: org } = yield* Effect.flatMap(GitHubClient, (gh) => gh.repo);

	const loader = yield* ConfigLoader;
	const config = yield* loader.loadJson(inputs.configFile, SilkConfig);
	yield* Effect.logInfo(`Config loaded: ${config.labels.length} labels`);

	const repos = yield* Step.groupStep("Discover repositories", discoverRepos(org, inputs));
	const projectNumbers = inputs.syncProjects ? projectNumbersOf(repos) : [];
	const projectCache = yield* resolveProjects(org, projectNumbers);
	const results = yield* Step.groupStep("Sync repositories", processRepos(repos, config, projectCache, inputs));

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
