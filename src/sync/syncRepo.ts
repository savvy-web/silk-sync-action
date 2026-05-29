import type { GitHubClient, GitHubGraphQL } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import type { GitHubRepo } from "../github/reads.js";
import { getRepo } from "../github/reads.js";
import type { DiscoveredRepo, RepoSyncResult, SettingChange, SilkConfig, SyncErrorRecord } from "../schemas.js";
import { syncLabels } from "./labels.js";
import type { ProjectCache } from "./projects.js";
import { syncProject } from "./projects.js";
import { syncSettings } from "./settings.js";

export interface SyncInputs {
	readonly dryRun: boolean;
	readonly removeCustomLabels: boolean;
	readonly syncSettings: boolean;
	readonly syncProjects: boolean;
	readonly skipBackfill: boolean;
}

const projectNumberOf = (repo: DiscoveredRepo): number | null => {
	if (repo.customProperties["project-tracking"] !== "true") return null;
	const raw = repo.customProperties["project-number"];
	if (!raw) return null;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n > 0 ? n : null;
};

export const syncRepo = (
	repo: DiscoveredRepo,
	config: SilkConfig,
	projectCache: ProjectCache,
	inputs: SyncInputs,
): Effect.Effect<RepoSyncResult, never, GitHubClient | GitHubGraphQL> =>
	Effect.gen(function* () {
		const errors: Array<SyncErrorRecord> = [];

		const repoData = yield* getRepo(repo.owner, repo.name).pipe(
			Effect.catchAll((e) => {
				errors.push({ target: "repo", operation: "get", error: e.reason });
				return Effect.succeed(null as GitHubRepo | null);
			}),
		);

		const labelResult = yield* syncLabels(
			repo.owner,
			repo.name,
			config.labels,
			inputs.dryRun,
			inputs.removeCustomLabels,
		);

		let settings: { changes: ReadonlyArray<SettingChange>; applied: boolean } = { changes: [], applied: true };
		if (inputs.syncSettings && repoData)
			settings = yield* syncSettings(repo.owner, repo.name, config.settings, repoData, inputs.dryRun);

		let project = {
			projectTitle: null as string | null,
			linkStatus: null as RepoSyncResult["projectLinkStatus"],
			itemsAdded: 0,
			itemsAlreadyPresent: 0,
		};
		const projectNumber = projectNumberOf(repo);
		if (inputs.syncProjects && projectNumber !== null) {
			const nodeId = repoData?.node_id ?? repo.nodeId;
			project = yield* syncProject(
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
			settingChanges: [...settings.changes],
			settingsApplied: settings.applied,
			projectNumber,
			projectTitle: project.projectTitle,
			projectLinkStatus: project.linkStatus,
			itemsAdded: project.itemsAdded,
			itemsAlreadyPresent: project.itemsAlreadyPresent,
			errors: [...errors],
			success: errors.length === 0,
		} satisfies RepoSyncResult;
	});
