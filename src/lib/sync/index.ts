/**
 * Per-repo sync orchestration.
 *
 * @remarks
 * Coordinates label sync, settings sync, project linking, and backfill
 * for each discovered repository. Uses error accumulation so individual
 * repo failures don't halt the run.
 *
 * @module sync
 */

import { info } from "@actions/core";
import { Effect } from "effect";
import { logDebug } from "../logging.js";
import { INTER_REPO_DELAY_MS, REST_CHECK_INTERVAL, checkRestRateLimit, delay } from "../rate-limit/throttle.js";
import type {
	ActionInputs,
	DiscoveredRepo,
	RepoSyncResult,
	SettingChange,
	SilkConfig,
	SyncErrorRecord,
} from "../schemas/index.js";
import type { GitHubGraphQLClient, GitHubRepo } from "../services/types.js";
import { GitHubRestClient } from "../services/types.js";
import { syncLabels } from "./labels.js";
import type { ProjectCache } from "./projects.js";
import { syncProject } from "./projects.js";
import { syncSettings } from "./settings.js";

/**
 * Process all discovered repos sequentially with error accumulation.
 *
 * @remarks
 * Each repo is processed independently; errors are captured in the
 * result rather than halting the run. A brief delay is inserted between
 * repos, and REST rate limits are checked periodically.
 *
 * @param repos - Discovered repositories to process
 * @param config - Silk sync configuration
 * @param projectCache - Pre-resolved project cache
 * @param inputs - Parsed action inputs
 * @returns Array of per-repo sync results
 *
 * @internal
 */
export function processRepos(
	repos: ReadonlyArray<DiscoveredRepo>,
	config: SilkConfig,
	projectCache: ProjectCache,
	inputs: ActionInputs,
): Effect.Effect<ReadonlyArray<RepoSyncResult>, never, GitHubRestClient | GitHubGraphQLClient> {
	return Effect.gen(function* () {
		const results: RepoSyncResult[] = [];

		for (let i = 0; i < repos.length; i++) {
			const repo = repos[i];

			if (i > 0 && i % REST_CHECK_INTERVAL === 0) {
				yield* checkRestRateLimit();
			}

			if (i > 0) {
				yield* delay(INTER_REPO_DELAY_MS);
			}

			info(`\nProcessing: ${repo.fullName} (${i + 1}/${repos.length})`);
			info("-".repeat(60));

			const result = yield* processRepo(repo, config, projectCache, inputs);
			results.push(result);
		}

		return results;
	});
}

/**
 * Process a single repository: labels -> settings -> project.
 */
function processRepo(
	repo: DiscoveredRepo,
	config: SilkConfig,
	projectCache: ProjectCache,
	inputs: ActionInputs,
): Effect.Effect<RepoSyncResult, never, GitHubRestClient | GitHubGraphQLClient> {
	return Effect.gen(function* () {
		const rest = yield* GitHubRestClient;
		const errors: SyncErrorRecord[] = [];

		const repoData = yield* rest.getRepo(repo.owner, repo.name).pipe(
			Effect.catchAll((e) => {
				errors.push({ target: "repo", operation: "get", error: e.message });
				return Effect.succeed(null);
			}),
		);

		// Labels
		const labelResult = yield* syncLabels(
			repo.owner,
			repo.name,
			config.labels,
			inputs.dryRun,
			inputs.removeCustomLabels,
		);

		// Settings
		let settingsResult: { changes: ReadonlyArray<SettingChange>; applied: boolean } = {
			changes: [],
			applied: true,
		};

		if (inputs.syncSettings && repoData) {
			yield* logDebug(`${repo.name}: checking settings...`);
			settingsResult = yield* syncSettings(
				repo.owner,
				repo.name,
				config.settings,
				repoData as GitHubRepo,
				inputs.dryRun,
			);
		}

		// Project linking + backfill
		let projectResult = {
			projectTitle: null as string | null,
			linkStatus: null as "linked" | "already" | "dry-run" | "error" | "skipped" | null,
			itemsAdded: 0,
			itemsAlreadyPresent: 0,
		};

		const projectNumber = getProjectNumber(repo);
		if (inputs.syncProjects && projectNumber !== null) {
			const nodeId = repoData?.node_id ?? repo.nodeId;
			projectResult = yield* syncProject(
				repo.owner,
				repo.name,
				nodeId,
				projectNumber,
				projectCache,
				inputs.dryRun,
				inputs.skipBackfill,
			);
		}

		return {
			repo: repo.name,
			owner: repo.owner,
			labels: [...labelResult.results],
			customLabels: [...labelResult.customLabels],
			settingChanges: [...settingsResult.changes],
			settingsApplied: settingsResult.applied,
			projectNumber,
			projectTitle: projectResult.projectTitle,
			projectLinkStatus: projectResult.linkStatus,
			itemsAdded: projectResult.itemsAdded,
			itemsAlreadyPresent: projectResult.itemsAlreadyPresent,
			errors: [...errors],
			success: errors.length === 0,
		} satisfies RepoSyncResult;
	});
}

/**
 * Extract project number from a discovered repo's custom properties.
 */
function getProjectNumber(repo: DiscoveredRepo): number | null {
	const projectTracking = repo.customProperties["project-tracking"];
	const projectNumber = repo.customProperties["project-number"];

	if (projectTracking === "true" && projectNumber) {
		const num = Number.parseInt(projectNumber, 10);
		return Number.isFinite(num) && num > 0 ? num : null;
	}

	return null;
}
