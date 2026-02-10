import * as core from "@actions/core";
import { describe, expect, it, vi } from "vitest";

import type { RepoSyncResult } from "../schemas/index.js";
import { printConsoleSummary } from "./console.js";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
}));

const makeResult = (overrides: Partial<RepoSyncResult> = {}): RepoSyncResult => ({
	repo: "my-repo",
	owner: "org",
	labels: [
		{ name: "bug", operation: "created" },
		{ name: "docs", operation: "unchanged" },
	],
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

describe("printConsoleSummary", () => {
	it("prints summary without errors", () => {
		const infoMock = vi.mocked(core.info);
		infoMock.mockClear();

		printConsoleSummary([makeResult()], false);

		const output = infoMock.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("SYNC COMPLETE");
		expect(output).toContain("1 processed");
		expect(output).toContain("Created: 1");
		expect(output).toContain("Unchanged: 1");
	});

	it("prints dry-run heading", () => {
		const infoMock = vi.mocked(core.info);
		infoMock.mockClear();

		printConsoleSummary([makeResult()], true);

		const output = infoMock.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("DRY-RUN COMPLETE");
	});

	it("prints partial failures", () => {
		const infoMock = vi.mocked(core.info);
		infoMock.mockClear();

		printConsoleSummary(
			[
				makeResult({
					success: false,
					errors: [{ target: "bug", operation: "create", error: "409 Conflict" }],
				}),
			],
			false,
		);

		const output = infoMock.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Partial Failures");
		expect(output).toContain("409 Conflict");
	});

	it("prints project stats when projects are linked", () => {
		const infoMock = vi.mocked(core.info);
		infoMock.mockClear();

		printConsoleSummary(
			[
				makeResult({
					projectNumber: 1,
					projectTitle: "Silk Suite",
					projectLinkStatus: "linked",
					itemsAdded: 3,
					itemsAlreadyPresent: 5,
				}),
			],
			false,
		);

		const output = infoMock.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Project Statistics");
		expect(output).toContain("linked: 1");
	});

	it("prints settings stats when there is drift", () => {
		const infoMock = vi.mocked(core.info);
		infoMock.mockClear();

		printConsoleSummary(
			[
				makeResult({
					settingChanges: [{ key: "has_wiki", from: true, to: false }],
				}),
			],
			false,
		);

		const output = infoMock.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Settings Statistics");
		expect(output).toContain("changed: 1");
	});
});
