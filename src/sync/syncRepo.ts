import type { GitHubClient, GitHubIssue, GitHubRepository } from "@effected/github";
import { Repo, RepoRef } from "@effected/github";
import { Effect } from "effect";
import type { RepoSnapshot } from "../github/reads.js";
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

/**
 * Sync one repository.
 *
 * @remarks
 * The error channel is `never` by contract: every failure inside becomes a
 * {@link SyncErrorRecord} on the result, so one bad repository never aborts the
 * run. `Repo` is provided **here**, once, so every read and write below acts on
 * this repository without threading an `(owner, repo)` pair through each call.
 */
export const syncRepo = (
	repo: DiscoveredRepo,
	config: SilkConfig,
	projectCache: ProjectCache,
	inputs: SyncInputs,
): Effect.Effect<RepoSyncResult, never, GitHubClient | GitHubIssue | GitHubRepository> =>
	Effect.gen(function* () {
		const errors: Array<SyncErrorRecord> = [];

		const repoData = yield* getRepo.pipe(
			Effect.catch((e) => {
				errors.push({ target: "repo", operation: "get", error: e.reason });
				return Effect.succeed(null as RepoSnapshot | null);
			}),
		);

		const labelResult = yield* syncLabels(
			repo.owner,
			repo.name,
			config.labels,
			inputs.dryRun,
			inputs.removeCustomLabels,
		);
		errors.push(...labelResult.errors);

		let settings: { changes: ReadonlyArray<SettingChange>; applied: boolean } = { changes: [], applied: true };
		if (inputs.syncSettings && repoData) settings = yield* syncSettings(config.settings, repoData, inputs.dryRun);

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
	}).pipe(Repo.provide(new RepoRef({ owner: repo.owner, repo: repo.name })));
