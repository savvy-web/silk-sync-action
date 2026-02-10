/**
 * Console reporting.
 *
 * @remarks
 * Generates a final summary printed to the console after all repos
 * have been processed. Aggregates label, settings, and project stats.
 *
 * @module reporting/console
 */

import { info } from "@actions/core";

import type { RepoSyncResult } from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Aggregated statistics across all repos. */
export interface SyncStats {
	readonly total: number;
	readonly succeeded: number;
	readonly failed: number;
	readonly labels: {
		readonly created: number;
		readonly updated: number;
		readonly removed: number;
		readonly unchanged: number;
		readonly customCount: number;
	};
	readonly settings: {
		readonly changed: number;
		readonly reposWithDrift: number;
	};
	readonly projects: {
		readonly linked: number;
		readonly alreadyLinked: number;
		readonly itemsAdded: number;
		readonly itemsAlreadyPresent: number;
	};
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/**
 * Print a final console summary after all repos have been processed.
 *
 * @param results - Per-repo sync results
 * @param dryRun - Whether this was a dry-run
 *
 * @internal
 */
export function printConsoleSummary(results: ReadonlyArray<RepoSyncResult>, dryRun: boolean): void {
	const stats = aggregateStats(results);

	info("");
	info("=".repeat(60));
	info(dryRun ? "DRY-RUN COMPLETE - SUMMARY" : "SYNC COMPLETE - SUMMARY");
	info("=".repeat(60));
	info("");

	info(`Repositories: ${stats.total} processed, ${stats.succeeded} succeeded, ${stats.failed} failed`);
	info("");

	printLabelStats(stats, dryRun);
	printSettingsStats(stats, dryRun);
	printProjectStats(stats, dryRun);

	const failedRepos = results.filter((r) => !r.success);
	if (failedRepos.length > 0) {
		info("Partial Failures:");
		for (const repo of failedRepos) {
			info(`  ${repo.owner}/${repo.repo} (${repo.errors.length} errors):`);
			for (const err of repo.errors) {
				info(`    - ${err.operation} ${err.target}: ${err.error}`);
			}
		}
		info("");
	}

	info("=".repeat(60));
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

export function aggregateStats(results: ReadonlyArray<RepoSyncResult>): SyncStats {
	let labelsCreated = 0;
	let labelsUpdated = 0;
	let labelsRemoved = 0;
	let labelsUnchanged = 0;
	let customCount = 0;
	let settingsChanged = 0;
	let reposWithDrift = 0;
	let linked = 0;
	let alreadyLinked = 0;
	let itemsAdded = 0;
	let itemsAlreadyPresent = 0;

	for (const r of results) {
		for (const label of r.labels) {
			switch (label.operation) {
				case "created":
					labelsCreated++;
					break;
				case "updated":
					labelsUpdated++;
					break;
				case "removed":
					labelsRemoved++;
					break;
				case "unchanged":
					labelsUnchanged++;
					break;
			}
		}

		customCount += r.customLabels.length;

		if (r.settingChanges.length > 0) {
			settingsChanged += r.settingChanges.length;
			reposWithDrift++;
		}

		if (r.projectLinkStatus === "linked" || r.projectLinkStatus === "dry-run") {
			linked++;
		} else if (r.projectLinkStatus === "already") {
			alreadyLinked++;
		}

		itemsAdded += r.itemsAdded;
		itemsAlreadyPresent += r.itemsAlreadyPresent;
	}

	return {
		total: results.length,
		succeeded: results.filter((r) => r.success).length,
		failed: results.filter((r) => !r.success).length,
		labels: {
			created: labelsCreated,
			updated: labelsUpdated,
			removed: labelsRemoved,
			unchanged: labelsUnchanged,
			customCount,
		},
		settings: { changed: settingsChanged, reposWithDrift },
		projects: { linked, alreadyLinked, itemsAdded, itemsAlreadyPresent },
	};
}

function printLabelStats(stats: SyncStats, dryRun: boolean): void {
	const verb = dryRun ? "to " : "";
	info("Label Statistics:");
	info(`  ${verb}Created: ${stats.labels.created}`);
	info(`  ${verb}Updated: ${stats.labels.updated}`);
	if (stats.labels.removed > 0) {
		info(`  ${verb}Removed: ${stats.labels.removed}`);
	}
	info(`  Unchanged: ${stats.labels.unchanged}`);
	if (stats.labels.customCount > 0) {
		info(`  Custom labels found: ${stats.labels.customCount}`);
	}
	info("");
}

function printSettingsStats(stats: SyncStats, dryRun: boolean): void {
	if (stats.settings.changed === 0 && stats.settings.reposWithDrift === 0) return;

	const verb = dryRun ? "to change" : "changed";
	info("Settings Statistics:");
	info(`  Settings ${verb}: ${stats.settings.changed}`);
	info(`  Repos with drift: ${stats.settings.reposWithDrift}`);
	info("");
}

function printProjectStats(stats: SyncStats, dryRun: boolean): void {
	const { linked, alreadyLinked, itemsAdded, itemsAlreadyPresent } = stats.projects;
	if (linked === 0 && alreadyLinked === 0) return;

	const linkVerb = dryRun ? "to link" : "linked";
	const addVerb = dryRun ? "to add" : "added";
	info("Project Statistics:");
	info(`  Repos ${linkVerb}: ${linked}`);
	info(`  Repos already linked: ${alreadyLinked}`);
	info(`  Items ${addVerb}: ${itemsAdded}`);
	info(`  Items already in project: ${itemsAlreadyPresent}`);
	info("");
}
