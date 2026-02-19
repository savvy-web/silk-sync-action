import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { GitHubApiError } from "../schemas/errors.js";
import type { DiscoveredRepo, SilkConfig } from "../schemas/index.js";
import { makeMockLayer } from "../test-helpers.js";
import { processRepos } from "./index.js";
import type { ProjectCache } from "./projects.js";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
	debug: vi.fn(),
	warning: vi.fn(),
	isDebug: () => false,
	getInput: () => "",
}));

// Speed up tests by removing real delays
vi.mock("../rate-limit/throttle.js", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		delay: () => Effect.void,
		checkRestRateLimit: () => Effect.succeed(5000),
		INTER_REPO_DELAY_MS: 0,
		REST_CHECK_INTERVAL: 10,
	};
});

const config: SilkConfig = {
	labels: [{ name: "bug", description: "Bug report", color: "d73a4a" }],
	settings: { has_wiki: false },
};

const inputs = {
	appId: "1",
	appPrivateKey: "k",
	configFile: "c",
	customProperties: [],
	repos: [],
	dryRun: false,
	removeCustomLabels: false,
	syncSettings: true,
	syncProjects: false,
	skipBackfill: false,
	logLevel: "info" as const,
	skipTokenRevoke: false,
};

const makeRepo = (name: string): DiscoveredRepo => ({
	name,
	owner: "org",
	fullName: `org/${name}`,
	nodeId: `R_${name}`,
	customProperties: {},
});

const emptyProjectCache: ProjectCache = new Map();

describe("processRepos", () => {
	it("processes repos and returns results", async () => {
		const layer = makeMockLayer({
			listLabels: () => Effect.succeed([]),
			createLabel: () => Effect.void,
		});

		const results = await Effect.runPromise(
			processRepos([makeRepo("repo-a"), makeRepo("repo-b")], config, emptyProjectCache, inputs).pipe(
				Effect.provide(layer),
			),
		);

		expect(results).toHaveLength(2);
		expect(results[0].repo).toBe("repo-a");
		expect(results[1].repo).toBe("repo-b");
	});

	it("accumulates errors without halting", async () => {
		const layer = makeMockLayer({
			getRepo: () => Effect.fail(new GitHubApiError({ operation: "getRepo", statusCode: 404, reason: "Not found" })),
			listLabels: () => Effect.succeed([]),
			createLabel: () => Effect.void,
		});

		const results = await Effect.runPromise(
			processRepos([makeRepo("bad-repo")], config, emptyProjectCache, inputs).pipe(Effect.provide(layer)),
		);

		expect(results).toHaveLength(1);
		// Error in getRepo is captured in errors array
		expect(results[0].errors.length).toBeGreaterThan(0);
		expect(results[0].success).toBe(false);
	});

	it("skips settings sync when disabled", async () => {
		let updateRepoCalled = false;
		const layer = makeMockLayer({
			listLabels: () => Effect.succeed([]),
			updateRepo: () => {
				updateRepoCalled = true;
				return Effect.void;
			},
		});

		const noSettingsInputs = { ...inputs, syncSettings: false };

		await Effect.runPromise(
			processRepos([makeRepo("repo")], config, emptyProjectCache, noSettingsInputs).pipe(Effect.provide(layer)),
		);

		expect(updateRepoCalled).toBe(false);
	});

	it("syncs projects when enabled with project tracking", async () => {
		const projectCache: ProjectCache = new Map();
		projectCache.set(5, { ok: true, project: { id: "PVT_5", title: "Board", number: 5, closed: false } });

		const layer = makeMockLayer(
			{
				listLabels: () => Effect.succeed([]),
			},
			{
				linkRepoToProject: () => Effect.void,
				addItemToProject: () => Effect.void,
			},
		);

		const repoWithProject: DiscoveredRepo = {
			...makeRepo("tracked"),
			customProperties: { "project-tracking": "true", "project-number": "5" },
		};

		const projectInputs = { ...inputs, syncProjects: true, skipBackfill: true };
		const results = await Effect.runPromise(
			processRepos([repoWithProject], config, projectCache, projectInputs).pipe(Effect.provide(layer)),
		);

		expect(results[0].projectNumber).toBe(5);
		expect(results[0].projectTitle).toBe("Board");
	});

	it("returns null for invalid project numbers", async () => {
		const layer = makeMockLayer({ listLabels: () => Effect.succeed([]) });

		const repoWithBadProject: DiscoveredRepo = {
			...makeRepo("bad-proj"),
			customProperties: { "project-tracking": "true", "project-number": "not-a-number" },
		};

		const projectInputs = { ...inputs, syncProjects: true };
		const results = await Effect.runPromise(
			processRepos([repoWithBadProject], config, emptyProjectCache, projectInputs).pipe(Effect.provide(layer)),
		);

		expect(results[0].projectNumber).toBe(null);
	});

	it("returns null when project-tracking is not true", async () => {
		const layer = makeMockLayer({ listLabels: () => Effect.succeed([]) });

		const repoNoTracking: DiscoveredRepo = {
			...makeRepo("no-track"),
			customProperties: { "project-tracking": "false", "project-number": "5" },
		};

		const results = await Effect.runPromise(
			processRepos([repoNoTracking], config, emptyProjectCache, { ...inputs, syncProjects: true }).pipe(
				Effect.provide(layer),
			),
		);

		expect(results[0].projectNumber).toBe(null);
	});
});
