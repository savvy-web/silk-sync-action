import { describe, expect, it } from "vitest";
import type { RepoSyncResult } from "../schemas.js";
import { aggregateStats } from "./stats.js";

const base: RepoSyncResult = {
	repo: "r",
	owner: "o",
	labels: [],
	customLabels: [],
	settingChanges: [],
	settingsApplied: true,
	projectNumber: null,
	projectTitle: null,
	projectLinkStatus: null,
	itemsAdded: 0,
	itemsAlreadyPresent: 0,
	errors: [],
	success: true,
};

describe("aggregateStats", () => {
	it("counts label operations, drift, and project links", () => {
		const stats = aggregateStats([
			{
				...base,
				labels: [
					{ name: "a", operation: "created" },
					{ name: "b", operation: "unchanged" },
				],
				settingChanges: [{ key: "has_wiki", from: true, to: false }],
				projectLinkStatus: "linked",
				itemsAdded: 3,
			},
			{
				...base,
				projectLinkStatus: "already",
				success: false,
				errors: [{ target: "repo", operation: "get", error: "x" }],
			},
		]);
		expect(stats.total).toBe(2);
		expect(stats.failed).toBe(1);
		expect(stats.labels.created).toBe(1);
		expect(stats.labels.unchanged).toBe(1);
		expect(stats.settings.reposWithDrift).toBe(1);
		expect(stats.projects.linked).toBe(1);
		expect(stats.projects.alreadyLinked).toBe(1);
		expect(stats.projects.itemsAdded).toBe(3);
	});
});
