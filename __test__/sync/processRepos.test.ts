import { GitHubError } from "@effected/github";
import type { StepLogEntry } from "@effected/github-actions";
import { ActionLogger } from "@effected/github-actions";
import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { DiscoveredRepo, RepoSyncResult, SilkConfig } from "../../src/schemas.js";
import { describeResult, processRepos } from "../../src/sync/processRepos.js";
import type { GitHubTestOptions } from "../test-support.js";
import { githubTestLayer } from "../test-support.js";

const config: SilkConfig = { labels: [], settings: {} };
const repos: ReadonlyArray<DiscoveredRepo> = [
	{ name: "r1", owner: "acme", fullName: "acme/r1", nodeId: "N1", customProperties: {} },
	{ name: "r2", owner: "acme", fullName: "acme/r2", nodeId: "N2", customProperties: {} },
];

const inputs = {
	dryRun: false,
	removeCustomLabels: false,
	syncSettings: false,
	syncProjects: false,
	skipBackfill: false,
};

const healthy: GitHubTestOptions = {
	request: {
		"GET /repos/{owner}/{repo}": { node_id: "N", name: "r", full_name: "acme/r", owner: { login: "acme" } },
	},
	paginate: { "GET /repos/{owner}/{repo}/labels": [] },
};

const broken: GitHubTestOptions = {
	request: { "GET /repos/{owner}/{repo}": GitHubError.notFound("GitHubRepository.get", "repo") },
	paginate: {
		"GET /repos/{owner}/{repo}/labels": GitHubError.rejected("GitHubRepository.listLabels", 403, "Forbidden"),
	},
};

const run = async (
	github: GitHubTestOptions,
	syncConfig: SilkConfig = config,
): Promise<{ results: ReadonlyArray<RepoSyncResult>; entries: ReadonlyArray<StepLogEntry> }> => {
	const log = ActionLogger.recording();
	const results = await processRepos(repos, syncConfig, new Map(), inputs).pipe(
		Effect.provide(githubTestLayer(github)),
		Effect.provide(log.layer),
		Effect.provide(Logger.layer([])),
		Effect.runPromise,
	);
	return { results, entries: log.entries() };
};

const steps = (entries: ReadonlyArray<StepLogEntry>) =>
	entries.flatMap((e) => (e.kind === "step" ? [{ name: e.name, outcome: e.outcome, summary: e.summary }] : []));

describe("processRepos", () => {
	it("processes every repo and returns one result each, in order", async () => {
		const { results } = await run(healthy);
		expect(results).toHaveLength(2);
		expect(results.map((r) => r.repo)).toEqual(["r1", "r2"]);
	});

	it("still returns a result for a repo whose reads all fail", async () => {
		// Every read is scripted to fail — and the run does not.
		const { results } = await run(broken);
		expect(results).toHaveLength(2);
		expect(results.every((r) => r.success === false)).toBe(true);
	});

	it("logs one successful step per repository, named for it", async () => {
		const { entries } = await run(healthy);
		expect(steps(entries)).toEqual([
			{ name: "acme/r1", outcome: "success", summary: "acme/r1 · up to date" },
			{ name: "acme/r2", outcome: "success", summary: "acme/r2 · up to date" },
		]);
	});

	it("fails the step of a repository that recorded errors, naming the first", async () => {
		const { entries } = await run(broken);
		const logged = steps(entries);
		expect(logged.map((s) => [s.name, s.outcome])).toEqual([
			["acme/r1", "failure"],
			["acme/r2", "failure"],
		]);
		expect(logged[0]?.summary).toContain("1 error: get repo:");
	});

	it("summarises what changed on the success line", async () => {
		const { entries } = await run(
			{ ...healthy, request: { ...healthy.request, "POST /repos/{owner}/{repo}/labels": {} } },
			{ labels: [{ name: "bug", description: "", color: "d73a4a" }], settings: {} },
		);
		expect(steps(entries)[0]?.summary).toBe("acme/r1 · labels 1 created");
	});
});

describe("describeResult", () => {
	const base: RepoSyncResult = {
		repo: "a",
		owner: "acme",
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

	it("says up to date when nothing changed", () => {
		expect(describeResult(base)).toBe("acme/a · up to date");
	});

	it("lists label, setting, project and item changes", () => {
		expect(
			describeResult({
				...base,
				labels: [
					{ name: "x", operation: "created" },
					{ name: "y", operation: "updated", changes: [] },
					{ name: "z", operation: "unchanged" },
				],
				settingChanges: [{ key: "has_wiki", from: true, to: false }],
				projectNumber: 9,
				projectTitle: "Board",
				projectLinkStatus: "linked",
				itemsAdded: 2,
			}),
		).toBe("acme/a · labels 1 created, 1 updated · 1 setting changed · linked to Board · 2 items added");
	});
});
