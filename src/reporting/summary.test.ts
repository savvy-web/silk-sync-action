import { describe, expect, it } from "vitest";
import type { SyncStats } from "./stats.js";
import { buildSummaryMarkdown } from "./summary.js";

const stats: SyncStats = {
	total: 2,
	succeeded: 2,
	failed: 0,
	labels: { created: 1, updated: 0, removed: 0, unchanged: 3, customCount: 0 },
	settings: { changed: 1, reposWithDrift: 1 },
	projects: { linked: 1, alreadyLinked: 0, itemsAdded: 2, itemsAlreadyPresent: 0 },
};

describe("buildSummaryMarkdown", () => {
	it("includes a heading and repo counts", () => {
		const md = buildSummaryMarkdown(stats, { dryRun: false, syncSettings: true, syncProjects: true });
		expect(md).toContain("Silk Sync");
		expect(md).toContain("2");
	});

	it("notes dry-run mode", () => {
		const md = buildSummaryMarkdown(stats, { dryRun: true, syncSettings: true, syncProjects: true });
		expect(md.toLowerCase()).toContain("dry");
	});
});
