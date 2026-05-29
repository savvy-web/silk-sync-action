import type { RepoSyncResult } from "../schemas.js";

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
	readonly settings: { readonly changed: number; readonly reposWithDrift: number };
	readonly projects: {
		readonly linked: number;
		readonly alreadyLinked: number;
		readonly itemsAdded: number;
		readonly itemsAlreadyPresent: number;
	};
}

export const aggregateStats = (results: ReadonlyArray<RepoSyncResult>): SyncStats => {
	let created = 0;
	let updated = 0;
	let removed = 0;
	let unchanged = 0;
	let customCount = 0;
	let changed = 0;
	let reposWithDrift = 0;
	let linked = 0;
	let alreadyLinked = 0;
	let itemsAdded = 0;
	let itemsAlreadyPresent = 0;

	for (const r of results) {
		for (const l of r.labels) {
			if (l.operation === "created") created++;
			else if (l.operation === "updated") updated++;
			else if (l.operation === "removed") removed++;
			else if (l.operation === "unchanged") unchanged++;
		}
		customCount += r.customLabels.length;
		if (r.settingChanges.length > 0) {
			changed += r.settingChanges.length;
			reposWithDrift++;
		}
		if (r.projectLinkStatus === "linked" || r.projectLinkStatus === "dry-run") linked++;
		else if (r.projectLinkStatus === "already") alreadyLinked++;
		itemsAdded += r.itemsAdded;
		itemsAlreadyPresent += r.itemsAlreadyPresent;
	}

	return {
		total: results.length,
		succeeded: results.filter((r) => r.success).length,
		failed: results.filter((r) => !r.success).length,
		labels: { created, updated, removed, unchanged, customCount },
		settings: { changed, reposWithDrift },
		projects: { linked, alreadyLinked, itemsAdded, itemsAlreadyPresent },
	};
};
