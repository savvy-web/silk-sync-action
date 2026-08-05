import { describe, expect, it } from "vitest";
import type { SyncStats } from "../../src/reporting/stats.js";
import { buildSummaryMarkdown } from "../../src/reporting/summary.js";

const stats: SyncStats = {
	total: 2,
	succeeded: 2,
	failed: 0,
	labels: { created: 1, updated: 0, removed: 0, unchanged: 3, customCount: 0 },
	settings: { changed: 1, reposWithDrift: 1 },
	projects: { linked: 1, alreadyLinked: 0, itemsAdded: 2, itemsAlreadyPresent: 0 },
};

const all = { dryRun: false, syncSettings: true, syncProjects: true };

describe("buildSummaryMarkdown", () => {
	it("opens with a level-2 heading naming the action", () => {
		expect(buildSummaryMarkdown(stats, all).startsWith("## Silk Sync\n")).toBe(true);
	});

	it("notes dry-run mode in the heading", () => {
		expect(buildSummaryMarkdown(stats, { ...all, dryRun: true }).startsWith("## Silk Sync (dry-run)")).toBe(true);
	});

	it("always emits the repositories and labels tables", () => {
		const md = buildSummaryMarkdown(stats, { dryRun: false, syncSettings: false, syncProjects: false });
		expect(md).toContain("| Repositories | Count |");
		expect(md).toContain("| Labels | Count |");
	});

	it("omits the settings table when settings sync is off", () => {
		const md = buildSummaryMarkdown(stats, { ...all, syncSettings: false });
		expect(md).not.toContain("| Settings | Count |");
		expect(md).toContain("| Projects | Count |");
	});

	it("omits the projects table when project sync is off", () => {
		const md = buildSummaryMarkdown(stats, { ...all, syncProjects: false });
		expect(md).not.toContain("| Projects | Count |");
		expect(md).toContain("| Settings | Count |");
	});

	it("carries every count through to its row", () => {
		const md = buildSummaryMarkdown(stats, all);
		expect(md).toContain("| Total | 2 |");
		expect(md).toContain("| Succeeded | 2 |");
		expect(md).toContain("| Failed | 0 |");
		expect(md).toContain("| Created | 1 |");
		expect(md).toContain("| Unchanged | 3 |");
		expect(md).toContain("| Repos with drift | 1 |");
		expect(md).toContain("| Items added | 2 |");
	});

	it("separates sections with a blank line", () => {
		expect(buildSummaryMarkdown(stats, all)).toContain("\n\n");
	});
});
