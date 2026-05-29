import { GithubMarkdown } from "@savvy-web/github-action-effects";
import type { SyncStats } from "./stats.js";

export const buildSummaryMarkdown = (
	stats: SyncStats,
	flags: { readonly dryRun: boolean; readonly syncSettings: boolean; readonly syncProjects: boolean },
): string => {
	const parts: Array<string> = [];
	parts.push(GithubMarkdown.heading(flags.dryRun ? "Silk Sync (dry-run)" : "Silk Sync", 2));
	parts.push(
		GithubMarkdown.table(
			["Repositories", "Count"],
			[
				["Total", String(stats.total)],
				["Succeeded", String(stats.succeeded)],
				["Failed", String(stats.failed)],
			],
		),
	);
	parts.push(
		GithubMarkdown.table(
			["Labels", "Count"],
			[
				["Created", String(stats.labels.created)],
				["Updated", String(stats.labels.updated)],
				["Removed", String(stats.labels.removed)],
				["Unchanged", String(stats.labels.unchanged)],
				["Custom found", String(stats.labels.customCount)],
			],
		),
	);
	if (flags.syncSettings) {
		parts.push(
			GithubMarkdown.table(
				["Settings", "Count"],
				[
					["Changed", String(stats.settings.changed)],
					["Repos with drift", String(stats.settings.reposWithDrift)],
				],
			),
		);
	}
	if (flags.syncProjects) {
		parts.push(
			GithubMarkdown.table(
				["Projects", "Count"],
				[
					["Linked", String(stats.projects.linked)],
					["Already linked", String(stats.projects.alreadyLinked)],
					["Items added", String(stats.projects.itemsAdded)],
					["Items already present", String(stats.projects.itemsAlreadyPresent)],
				],
			),
		);
	}
	return parts.join("\n\n");
};
