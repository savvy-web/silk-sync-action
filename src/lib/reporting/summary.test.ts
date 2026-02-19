import * as core from "@actions/core";
import { describe, expect, it, vi } from "vitest";

import type { RepoSyncResult } from "../schemas/index.js";
import type { ProjectCache } from "../sync/projects.js";
import { writeStepSummary } from "./summary.js";

vi.mock("@actions/core", () => {
	const buffer: string[] = [];
	return {
		summary: {
			addHeading: vi.fn((text: string) => {
				buffer.push(`<h>${text}</h>`);
				return core.summary;
			}),
			addRaw: vi.fn((text: string) => {
				buffer.push(text);
				return core.summary;
			}),
			addTable: vi.fn(() => {
				buffer.push("<table/>");
				return core.summary;
			}),
			addDetails: vi.fn((label: string, content: string) => {
				buffer.push(`<details>${label}: ${content}</details>`);
				return core.summary;
			}),
			write: vi.fn(() => Promise.resolve(core.summary)),
			__buffer: buffer,
		},
	};
});

const getBuffer = (): string[] => {
	return (core.summary as unknown as { __buffer: string[] }).__buffer;
};

const clearBuffer = () => {
	getBuffer().length = 0;
	vi.mocked(core.summary.addHeading).mockClear();
	vi.mocked(core.summary.addRaw).mockClear();
	vi.mocked(core.summary.write).mockClear();
};

const makeResult = (overrides: Partial<RepoSyncResult> = {}): RepoSyncResult => ({
	repo: "my-repo",
	owner: "org",
	labels: [{ name: "bug", operation: "created" }],
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
	...overrides,
});

const emptyCache: ProjectCache = new Map();

describe("writeStepSummary", () => {
	it("writes dry-run banner", async () => {
		clearBuffer();
		await writeStepSummary([makeResult()], emptyCache, true, false, false, false, false);
		const buf = getBuffer().join("");
		expect(buf).toContain("Dry-Run");
		expect(buf).toContain("Preview only");
	});

	it("writes normal heading when not dry-run", async () => {
		clearBuffer();
		await writeStepSummary([makeResult()], emptyCache, false, false, false, false, false);
		const buf = getBuffer().join("");
		expect(buf).toContain("Sync Results");
		expect(buf).not.toContain("Dry-Run");
	});

	it("includes label statistics", async () => {
		clearBuffer();
		await writeStepSummary([makeResult()], emptyCache, false, false, false, false, false);
		const buf = getBuffer().join("");
		expect(buf).toContain("Label Statistics");
		expect(buf).toContain("created");
	});

	it("includes settings drift when syncing settings", async () => {
		clearBuffer();
		await writeStepSummary(
			[makeResult({ settingChanges: [{ key: "has_wiki", from: true, to: false }] })],
			emptyCache,
			false,
			true,
			false,
			false,
			false,
		);
		const buf = getBuffer().join("");
		expect(buf).toContain("Settings Statistics");
		expect(buf).toContain("Settings Drift");
		expect(buf).toContain("has_wiki");
	});

	it("includes project details when syncing projects", async () => {
		clearBuffer();
		const cache: ProjectCache = new Map();
		cache.set(1, { ok: true, project: { id: "PVT_1", title: "Suite", number: 1, closed: false } });

		await writeStepSummary(
			[makeResult({ projectNumber: 1, projectTitle: "Suite", projectLinkStatus: "linked", itemsAdded: 2 })],
			cache,
			false,
			false,
			true,
			false,
			false,
		);
		const buf = getBuffer().join("");
		expect(buf).toContain("Project Statistics");
		expect(buf).toContain("Suite");
	});

	it("includes partial failures in details blocks", async () => {
		clearBuffer();
		await writeStepSummary(
			[makeResult({ success: false, errors: [{ target: "bug", operation: "create", error: "409" }] })],
			emptyCache,
			false,
			false,
			false,
			false,
			false,
		);
		const buf = getBuffer().join("");
		expect(buf).toContain("Partial Failures");
		expect(buf).toContain("409");
	});

	it("includes custom labels inventory", async () => {
		clearBuffer();
		await writeStepSummary(
			[makeResult({ customLabels: ["stale", "wontfix"] })],
			emptyCache,
			false,
			false,
			false,
			false,
			false,
		);
		const buf = getBuffer().join("");
		expect(buf).toContain("Custom Labels Detected");
		expect(buf).toContain("stale");
	});

	it("calls summary.write()", async () => {
		clearBuffer();
		await writeStepSummary([makeResult()], emptyCache, false, false, false, false, false);
		expect(core.summary.write).toHaveBeenCalled();
	});

	it("shows removed labels count when removeCustomLabels is true", async () => {
		clearBuffer();
		await writeStepSummary([makeResult()], emptyCache, false, false, false, false, true);
		const buf = getBuffer().join("");
		expect(buf).toContain("removed");
	});

	it("shows failed project cache entries", async () => {
		clearBuffer();
		const cache: ProjectCache = new Map();
		cache.set(99, { ok: false, error: "Project not found" });

		await writeStepSummary(
			[makeResult({ projectNumber: 99, projectTitle: null, projectLinkStatus: "skipped" })],
			cache,
			false,
			false,
			true,
			false,
			false,
		);
		const buf = getBuffer().join("");
		expect(buf).toContain("Project not found");
	});

	it("shows backfill stats when not skipped", async () => {
		clearBuffer();
		const cache: ProjectCache = new Map();
		cache.set(1, { ok: true, project: { id: "PVT_1", title: "Board", number: 1, closed: false } });

		await writeStepSummary(
			[
				makeResult({
					projectNumber: 1,
					projectTitle: "Board",
					projectLinkStatus: "already",
					itemsAdded: 3,
					itemsAlreadyPresent: 7,
				}),
			],
			cache,
			false,
			false,
			true,
			false,
			false,
		);
		const buf = getBuffer().join("");
		expect(buf).toContain("already linked");
		expect(buf).toContain("Items added");
	});

	it("skips backfill stats when skipBackfill is true", async () => {
		clearBuffer();
		const cache: ProjectCache = new Map();
		cache.set(1, { ok: true, project: { id: "PVT_1", title: "Board", number: 1, closed: false } });

		await writeStepSummary(
			[makeResult({ projectNumber: 1, projectTitle: "Board", projectLinkStatus: "linked" })],
			cache,
			false,
			false,
			true,
			true,
			false,
		);
		const buf = getBuffer().join("");
		expect(buf).not.toContain("Items added");
	});
});
