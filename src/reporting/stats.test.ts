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
		expect(stats.succeeded).toBe(1);
		expect(stats.failed).toBe(1);
		expect(stats.labels.created).toBe(1);
		expect(stats.labels.unchanged).toBe(1);
		expect(stats.settings.reposWithDrift).toBe(1);
		expect(stats.projects.linked).toBe(1);
		expect(stats.projects.alreadyLinked).toBe(1);
		expect(stats.projects.itemsAdded).toBe(3);
	});

	it("counts every label operation kind", () => {
		const stats = aggregateStats([
			{
				...base,
				labels: [
					{ name: "a", operation: "created" },
					{ name: "b", operation: "updated" },
					{ name: "c", operation: "removed" },
					{ name: "d", operation: "unchanged" },
				],
				customLabels: ["x", "y"],
			},
		]);
		expect(stats.labels).toEqual({ created: 1, updated: 1, removed: 1, unchanged: 1, customCount: 2 });
	});

	it("counts a dry-run link as linked", () => {
		// The dry-run arm reports what *would* be linked; folding it into
		// `linked` is what makes a rehearsal's summary comparable to a real run's.
		const stats = aggregateStats([{ ...base, projectLinkStatus: "dry-run" }]);
		expect(stats.projects.linked).toBe(1);
		expect(stats.projects.alreadyLinked).toBe(0);
	});

	it("counts neither a skipped nor an errored link", () => {
		const stats = aggregateStats([
			{ ...base, projectLinkStatus: "skipped" },
			{ ...base, projectLinkStatus: "error" },
		]);
		expect(stats.projects.linked).toBe(0);
		expect(stats.projects.alreadyLinked).toBe(0);
	});

	it("counts every changed key but the repository only once", () => {
		const stats = aggregateStats([
			{
				...base,
				settingChanges: [
					{ key: "has_wiki", from: true, to: false },
					{ key: "has_issues", from: false, to: true },
				],
			},
			{ ...base },
		]);
		expect(stats.settings.changed).toBe(2);
		expect(stats.settings.reposWithDrift).toBe(1);
	});

	it("sums items added and already present across repos", () => {
		const stats = aggregateStats([
			{ ...base, itemsAdded: 2, itemsAlreadyPresent: 1 },
			{ ...base, itemsAdded: 3, itemsAlreadyPresent: 4 },
		]);
		expect(stats.projects.itemsAdded).toBe(5);
		expect(stats.projects.itemsAlreadyPresent).toBe(5);
	});

	it("reports zeroes for an empty run", () => {
		const stats = aggregateStats([]);
		expect(stats.total).toBe(0);
		expect(stats.succeeded).toBe(0);
		expect(stats.failed).toBe(0);
	});
});
