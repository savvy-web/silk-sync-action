import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { DiscoveredRepo, SilkConfig } from "../schemas.js";
import { githubTestLayer } from "../test-support.js";
import { syncRepo } from "./syncRepo.js";

const config: SilkConfig = {
	labels: [{ name: "bug", description: "", color: "d73a4a" }],
	settings: { has_wiki: false },
};
const repo: DiscoveredRepo = { name: "r", owner: "acme", fullName: "acme/r", nodeId: "RNODE", customProperties: {} };
const inputs = {
	dryRun: false,
	removeCustomLabels: false,
	syncSettings: true,
	syncProjects: true,
	skipBackfill: false,
};

const REPO_PAYLOAD = {
	node_id: "RNODE",
	name: "r",
	full_name: "acme/r",
	owner: { login: "acme" },
	has_wiki: true,
};

describe("syncRepo", () => {
	it("syncs labels + settings and reports success", async () => {
		const layer = githubTestLayer({
			request: {
				"GET /repos/{owner}/{repo}": REPO_PAYLOAD,
				"POST /repos/{owner}/{repo}/labels": {},
				"PATCH /repos/{owner}/{repo}": { ...REPO_PAYLOAD, has_wiki: false },
			},
			paginate: { "GET /repos/{owner}/{repo}/labels": [] },
		});
		const result = await syncRepo(repo, config, new Map(), inputs).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.success).toBe(true);
		expect(result.labels.some((l) => l.name === "bug" && l.operation === "created")).toBe(true);
		expect(result.settingChanges).toHaveLength(1);
		expect(result.settingsApplied).toBe(true);
	});

	it("acts on the discovered repository, not on some ambient one", async () => {
		// `githubTestLayer` seeds `Repo` as acme/r; `syncRepo` overrides it with
		// the discovered repo, so the result must carry the discovered identity.
		const other: DiscoveredRepo = {
			name: "other",
			owner: "acme",
			fullName: "acme/other",
			nodeId: "N",
			customProperties: {},
		};
		const layer = githubTestLayer({
			repo: { owner: "wrong", repo: "wrong" },
			request: { "GET /repos/{owner}/{repo}": REPO_PAYLOAD },
			paginate: { "GET /repos/{owner}/{repo}/labels": [] },
		});
		const result = await syncRepo(other, { labels: [], settings: {} }, new Map(), {
			...inputs,
			syncSettings: false,
			syncProjects: false,
		}).pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);
		expect(result.repo).toBe("other");
		expect(result.owner).toBe("acme");
	});

	it("records an error when the repo fetch fails", async () => {
		const layer = githubTestLayer({ paginate: { "GET /repos/{owner}/{repo}/labels": [] } });
		const result = await syncRepo(repo, config, new Map(), {
			...inputs,
			syncSettings: false,
			syncProjects: false,
		}).pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);
		expect(result.success).toBe(false);
		expect(result.errors[0]?.target).toBe("repo");
		expect(result.errors[0]?.operation).toBe("get");
	});

	it("links a project-tracking repo to its project", async () => {
		const trackingRepo: DiscoveredRepo = {
			...repo,
			customProperties: { "project-tracking": "true", "project-number": "5" },
		};
		const cache = new Map([
			[5, { ok: true as const, project: { id: "P5", title: "Board", number: 5, closed: false } }],
		]);
		const layer = githubTestLayer({
			request: { "GET /repos/{owner}/{repo}": REPO_PAYLOAD },
			paginate: { "GET /repos/{owner}/{repo}/labels": [], "GET /repos/{owner}/{repo}/issues": [] },
			graphql: { linkRepoToProject: { ok: true, data: {} } },
		});
		const result = await syncRepo(trackingRepo, config, cache, {
			...inputs,
			syncSettings: false,
			skipBackfill: true,
		}).pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);
		expect(result.projectNumber).toBe(5);
		expect(result.projectLinkStatus).toBe("linked");
		expect(result.projectTitle).toBe("Board");
	});

	it("ignores project linking when project-tracking is not 'true'", async () => {
		const untracked: DiscoveredRepo = { ...repo, customProperties: { "project-number": "5" } };
		const layer = githubTestLayer({
			request: { "GET /repos/{owner}/{repo}": REPO_PAYLOAD },
			paginate: { "GET /repos/{owner}/{repo}/labels": [] },
		});
		const result = await syncRepo(untracked, { labels: [], settings: {} }, new Map(), {
			...inputs,
			syncSettings: false,
		}).pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);
		expect(result.projectNumber).toBeNull();
		expect(result.projectLinkStatus).toBeNull();
	});

	it("skips project linking entirely when sync-projects is off", async () => {
		const trackingRepo: DiscoveredRepo = {
			...repo,
			customProperties: { "project-tracking": "true", "project-number": "5" },
		};
		const layer = githubTestLayer({
			request: { "GET /repos/{owner}/{repo}": REPO_PAYLOAD },
			paginate: { "GET /repos/{owner}/{repo}/labels": [] },
		});
		const result = await syncRepo(trackingRepo, { labels: [], settings: {} }, new Map(), {
			...inputs,
			syncSettings: false,
			syncProjects: false,
		}).pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);
		expect(result.projectNumber).toBe(5);
		expect(result.projectLinkStatus).toBeNull();
	});
});
