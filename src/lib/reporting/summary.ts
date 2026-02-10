/**
 * GitHub Actions step summary generation.
 *
 * @remarks
 * Builds a rich markdown summary using `core.summary` with tables,
 * expandable details blocks, and aggregate statistics. Written to
 * the GitHub Actions step summary after all repos are processed.
 *
 * @module reporting/summary
 */

import { summary } from "@actions/core";

import type { RepoSyncResult } from "../schemas/index.js";
import type { ProjectCache } from "../sync/projects.js";

/**
 * Generate and write the GitHub Actions step summary.
 *
 * @param results - Per-repo sync results
 * @param projectCache - Pre-resolved project cache
 * @param dryRun - Whether this was a dry-run
 * @param syncSettings - Whether settings sync was enabled
 * @param syncProjects - Whether project sync was enabled
 * @param skipBackfill - Whether backfill was skipped
 * @param removeCustomLabels - Whether custom label removal was enabled
 *
 * @internal
 */
export async function writeStepSummary(
	results: ReadonlyArray<RepoSyncResult>,
	projectCache: ProjectCache,
	dryRun: boolean,
	syncSettings: boolean,
	syncProjects: boolean,
	skipBackfill: boolean,
	removeCustomLabels: boolean,
): Promise<void> {
	if (dryRun) {
		summary.addHeading("Dry-Run Sync Results", 2);
		summary.addRaw("\n**Mode:** Preview only (no changes applied)\n\n");
	} else {
		summary.addHeading("Sync Results", 2);
	}

	const succeeded = results.filter((r) => r.success);
	const failed = results.filter((r) => !r.success);
	summary.addRaw(`**Repositories processed:** ${results.length}\n`);
	summary.addRaw(`**Successful:** ${succeeded.length}\n`);
	if (failed.length > 0) {
		summary.addRaw(`**Partially failed:** ${failed.length}\n`);
	}

	addLabelStats(results, dryRun, removeCustomLabels);

	if (syncSettings) {
		addSettingsStats(results, dryRun);
	}

	if (syncProjects) {
		addProjectStats(results, projectCache, dryRun, skipBackfill);
	}

	if (failed.length > 0) {
		addPartialFailures(failed);
	}

	addCustomLabelsInventory(results);

	await summary.write();
}

// ---------------------------------------------------------------------------
// Label statistics
// ---------------------------------------------------------------------------

function addLabelStats(results: ReadonlyArray<RepoSyncResult>, dryRun: boolean, removeCustomLabels: boolean): void {
	const created = results.reduce((sum, r) => sum + r.labels.filter((l) => l.operation === "created").length, 0);
	const updated = results.reduce((sum, r) => sum + r.labels.filter((l) => l.operation === "updated").length, 0);
	const removed = results.reduce((sum, r) => sum + r.labels.filter((l) => l.operation === "removed").length, 0);

	summary.addHeading("Label Statistics", 3);
	summary.addRaw(`- Labels ${dryRun ? "to create" : "created"}: ${created}\n`);
	summary.addRaw(`- Labels ${dryRun ? "to update" : "updated"}: ${updated}\n`);
	if (removeCustomLabels || removed > 0) {
		summary.addRaw(`- Labels ${dryRun ? "to remove" : "removed"}: ${removed}\n`);
	}
}

// ---------------------------------------------------------------------------
// Settings statistics
// ---------------------------------------------------------------------------

function addSettingsStats(results: ReadonlyArray<RepoSyncResult>, dryRun: boolean): void {
	const totalChanged = results.reduce((sum, r) => sum + r.settingChanges.length, 0);
	const reposWithDrift = results.filter((r) => r.settingChanges.length > 0);

	summary.addHeading("Settings Statistics", 3);
	summary.addRaw(`- Settings ${dryRun ? "to change" : "changed"}: ${totalChanged}\n`);
	summary.addRaw(`- Repos with settings drift: ${reposWithDrift.length}\n`);

	if (reposWithDrift.length > 0) {
		summary.addHeading("Settings Drift", 4);
		for (const repo of reposWithDrift) {
			summary.addRaw(`\n**${repo.repo}** (${repo.settingChanges.length} settings):\n`);
			for (const change of repo.settingChanges) {
				summary.addRaw(`- \`${change.key}\`: \`${JSON.stringify(change.from)}\` → \`${JSON.stringify(change.to)}\`\n`);
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Project statistics
// ---------------------------------------------------------------------------

function addProjectStats(
	results: ReadonlyArray<RepoSyncResult>,
	projectCache: ProjectCache,
	dryRun: boolean,
	skipBackfill: boolean,
): void {
	const tracked = results.filter((r) => r.projectNumber !== null);
	if (tracked.length === 0) return;

	summary.addHeading("Project Statistics", 3);

	for (const [num, entry] of projectCache) {
		if (entry.ok) {
			const projectRepos = tracked.filter((r) => r.projectNumber === num);
			summary.addRaw(`- **Project #${num} "${entry.project.title}":** ${projectRepos.length} repos\n`);
		} else {
			summary.addRaw(`- **Project #${num}:** ${entry.error}\n`);
		}
	}

	const linked = tracked.filter((r) => r.projectLinkStatus === "linked" || r.projectLinkStatus === "dry-run").length;
	const alreadyLinked = tracked.filter((r) => r.projectLinkStatus === "already").length;
	const totalAdded = tracked.reduce((sum, r) => sum + r.itemsAdded, 0);
	const totalPresent = tracked.reduce((sum, r) => sum + r.itemsAlreadyPresent, 0);

	summary.addRaw(`- Repos ${dryRun ? "to link" : "linked"}: ${linked}\n`);
	summary.addRaw(`- Repos already linked: ${alreadyLinked}\n`);
	if (!skipBackfill) {
		summary.addRaw(`- Items ${dryRun ? "to add" : "added"}: ${totalAdded}\n`);
		summary.addRaw(`- Items already in project: ${totalPresent}\n`);
	}

	summary.addHeading("Project Details", 4);
	summary.addTable([
		[
			{ data: "Repository", header: true },
			{ data: "Project", header: true },
			{ data: "Title", header: true },
			{ data: "Link Status", header: true },
			{ data: "Backfill", header: true },
			{ data: "Status", header: true },
		],
		...tracked.map((r) => [
			r.repo,
			`#${r.projectNumber}`,
			r.projectTitle ?? "N/A",
			r.projectLinkStatus ?? "skipped",
			skipBackfill ? "skipped" : `${r.itemsAdded} added, ${r.itemsAlreadyPresent} existing`,
			r.errors.length > 0 ? "errors" : "ok",
		]),
	]);
}

// ---------------------------------------------------------------------------
// Partial failures
// ---------------------------------------------------------------------------

function addPartialFailures(failed: ReadonlyArray<RepoSyncResult>): void {
	summary.addHeading("Partial Failures", 3);

	for (const repo of failed) {
		const lines = repo.errors.map((err) => `- ${err.operation} \`${err.target}\`: ${err.error}`).join("\n");
		summary.addDetails(`${repo.owner}/${repo.repo} (${repo.errors.length} errors)`, lines);
	}
}

// ---------------------------------------------------------------------------
// Custom labels inventory
// ---------------------------------------------------------------------------

function addCustomLabelsInventory(results: ReadonlyArray<RepoSyncResult>): void {
	const reposWithCustom = results.filter((r) => r.customLabels.length > 0);
	if (reposWithCustom.length === 0) return;

	summary.addHeading("Custom Labels Detected", 3);

	const lines = reposWithCustom
		.map((r) => {
			const labels = r.customLabels.map((l) => `- \`${l}\``).join("\n");
			return `**${r.owner}/${r.repo}** (${r.customLabels.length} custom):\n${labels}`;
		})
		.join("\n\n");

	summary.addDetails(`${reposWithCustom.length} repos with custom labels`, lines);
}
