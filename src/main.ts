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

import { discoverRepos } from "./lib/discovery/index.js";
import { printConsoleSummary } from "./lib/reporting/console.js";
import { writeStepSummary } from "./lib/reporting/summary.js";
import type { ActionInputs, DiscoveredRepo, SilkConfig } from "./lib/schemas/index.js";
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

	const config: SilkConfig = JSON.parse(core.getState("config"));
	const inputs: ActionInputs = JSON.parse(core.getState("inputs"));
	const org = context.repo.owner;

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
		const succeeded = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;
		core.setOutput("repos-processed", String(results.length));
		core.setOutput("repos-succeeded", String(succeeded));
		core.setOutput("repos-failed", String(failed));

		if (failed > 0) {
			core.warning(`${failed} out of ${results.length} repos had errors`);
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
