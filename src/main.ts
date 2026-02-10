/**
 * Main step: discovery, sync, and reporting.
 *
 * Retrieves token, config, and inputs from state. Discovers repos,
 * resolves projects, processes each repo with error accumulation,
 * and generates console + step summaries.
 *
 * @module main
 */

import * as core from "@actions/core";
import { context } from "@actions/github";
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";

import { loadAndValidateConfig } from "./lib/config/load.js";
import { discoverRepos } from "./lib/discovery/index.js";
import { aggregateStats, printConsoleSummary } from "./lib/reporting/console.js";
import { writeStepSummary } from "./lib/reporting/summary.js";
import type { ActionInputs, DiscoveredRepo } from "./lib/schemas/index.js";
import { makeAppLayer } from "./lib/services/index.js";
import { processRepos } from "./lib/sync/index.js";
import { resolveProjects } from "./lib/sync/projects.js";

/**
 * Extract unique project numbers from discovered repos' custom properties.
 */
function extractProjectNumbers(repos: ReadonlyArray<DiscoveredRepo>): ReadonlyArray<number> {
	const numbers = new Set<number>();
	for (const repo of repos) {
		const tracking = repo.customProperties["project-tracking"];
		const numStr = repo.customProperties["project-number"];
		if (tracking === "true" && numStr) {
			const num = Number.parseInt(numStr, 10);
			if (Number.isFinite(num) && num > 0) {
				numbers.add(num);
			}
		}
	}
	return [...numbers];
}

const program = Effect.gen(function* () {
	const token = core.getState("token");
	if (!token) {
		core.setFailed("No token available. Ensure pre step ran successfully.");
		return;
	}

	const inputs: ActionInputs = JSON.parse(core.getState("inputs"));
	const org = context.repo.owner;

	// Load and validate config (deferred from pre step since repo isn't checked out until now)
	core.info(`Loading config from ${inputs.configFile}...`);
	const config = yield* loadAndValidateConfig(inputs.configFile);
	core.info(`Config loaded: ${config.labels.length} labels, ${Object.keys(config.settings).length} settings`);

	core.info(`Starting sync for ${org} (dry-run: ${inputs.dryRun})`);

	const appLayer = makeAppLayer(token);

	yield* Effect.gen(function* () {
		// 1. Discover repos
		const repos = yield* discoverRepos(org, inputs);

		// 2. Resolve projects (cached)
		const projectNumbers = inputs.syncProjects ? extractProjectNumbers(repos) : [];
		const projectCache = yield* resolveProjects(org, projectNumbers);

		// 3. Process each repo with error accumulation
		const results = yield* processRepos(repos, config, projectCache, inputs);

		// 4. Generate reports
		printConsoleSummary(results, inputs.dryRun);
		yield* Effect.promise(() =>
			writeStepSummary(
				results,
				projectCache,
				inputs.dryRun,
				inputs.syncSettings,
				inputs.syncProjects,
				inputs.skipBackfill,
				inputs.removeCustomLabels,
			),
		);

		// 5. Set outputs
		const stats = aggregateStats(results);
		const failedRepos = results.filter((r) => !r.success);

		core.setOutput(
			"results",
			JSON.stringify({
				success: failedRepos.length === 0,
				dryRun: inputs.dryRun,
				repos: {
					total: stats.total,
					succeeded: stats.succeeded,
					failed: stats.failed,
				},
				labels: stats.labels,
				settings: stats.settings,
				projects: stats.projects,
				errors: failedRepos.map((r) => ({
					repo: `${r.owner}/${r.repo}`,
					details: r.errors,
				})),
			}),
		);

		if (stats.failed > 0) {
			core.warning(`${stats.failed} out of ${stats.total} repos had errors`);
		}

		core.info("Main step complete.");
	}).pipe(
		Effect.provide(appLayer),
		Effect.catchAll((error) =>
			Effect.sync(() => {
				const message = error instanceof Error ? error.message : String(error);
				core.setFailed(`Main step failed: ${message}`);
			}),
		),
	);
});

NodeRuntime.runMain(program);
