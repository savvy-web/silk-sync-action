import { GitHubError } from "@effected/github";
import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { ProjectCacheEntry } from "../../src/sync/projects.js";
import { resolveProjects, syncProject } from "../../src/sync/projects.js";
import { githubTestLayer } from "../test-support.js";

const ROADMAP = { id: "P1", title: "Roadmap", number: 7, closed: false };
const cacheWithRoadmap = () => new Map([[7, { ok: true as const, project: ROADMAP }]]);

describe("resolveProjects", () => {
	it("caches resolved projects", async () => {
		const layer = githubTestLayer({
			graphql: { resolveProject: { ok: true, data: { organization: { projectV2: ROADMAP } } } },
		});
		const cache = await resolveProjects("acme", [7]).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(cache.get(7)).toEqual({ ok: true, project: ROADMAP } satisfies ProjectCacheEntry);
	});

	it("caches a closed project as a failure", async () => {
		const layer = githubTestLayer({
			graphql: {
				resolveProject: { ok: true, data: { organization: { projectV2: { ...ROADMAP, closed: true } } } },
			},
		});
		const cache = await resolveProjects("acme", [7]).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(cache.get(7)).toEqual({ ok: false, error: 'Project "Roadmap" is closed' });
	});

	it("caches a missing project as a failure", async () => {
		const layer = githubTestLayer({
			graphql: { resolveProject: { ok: true, data: { organization: { projectV2: null } } } },
		});
		const cache = await resolveProjects("acme", [9]).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(cache.get(9)).toEqual({ ok: false, error: 'Project #9 not found in org "acme"' });
	});

	it("resolves each distinct number once", async () => {
		const graphqlCalls: Array<string> = [];
		const layer = githubTestLayer({
			graphqlCalls,
			graphql: { resolveProject: { ok: true, data: { organization: { projectV2: ROADMAP } } } },
		});
		await resolveProjects("acme", [7, 7, 7]).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(graphqlCalls).toEqual(["resolveProject"]);
	});
});

describe("syncProject", () => {
	it("links and backfills open items", async () => {
		const graphqlCalls: Array<string> = [];
		const layer = githubTestLayer({
			graphqlCalls,
			graphql: {
				linkRepoToProject: { ok: true, data: { linkProjectV2ToRepository: { repository: { id: "r" } } } },
				addItemToProject: { ok: true, data: { addProjectV2ItemById: { item: { id: "i" } } } },
			},
			paginate: {
				"GET /repos/{owner}/{repo}/issues": [
					{ id: 1, node_id: "ISSUE_1", number: 1, title: "x", state: "open", labels: [], html_url: "u" },
				],
			},
		});

		const result = await syncProject("acme", "r", "REPO_NODE", 7, cacheWithRoadmap(), false, false).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("linked");
		expect(result.itemsAdded).toBe(1);
		expect(graphqlCalls).toEqual(["linkRepoToProject", "addItemToProject"]);
	});

	it("maps an already-linked repository to 'already' via the error kind", async () => {
		const layer = githubTestLayer({
			graphql: {
				linkRepoToProject: { ok: false, kind: "alreadyExists" },
			},
			paginate: { "GET /repos/{owner}/{repo}/issues": [] },
		});
		const result = await syncProject("acme", "r", "REPO_NODE", 7, cacheWithRoadmap(), false, true).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("already");
	});

	it("counts an already-present item separately from an added one", async () => {
		const layer = githubTestLayer({
			graphql: {
				linkRepoToProject: { ok: true, data: {} },
				addItemToProject: { ok: false, kind: "alreadyExists" },
			},
			paginate: {
				"GET /repos/{owner}/{repo}/issues": [
					{ id: 1, node_id: "I1", number: 1, title: "a", state: "open", labels: [], html_url: "u" },
				],
			},
		});
		const result = await syncProject("acme", "r", "REPO_NODE", 7, cacheWithRoadmap(), false, false).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.itemsAdded).toBe(0);
		expect(result.itemsAlreadyPresent).toBe(1);
	});

	it("skips when the project is not in the cache", async () => {
		const result = await syncProject("acme", "r", "REPO_NODE", 99, new Map(), false, false).pipe(
			Effect.provide(githubTestLayer({})),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("skipped");
		expect(result.projectTitle).toBeNull();
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.operation).toBe("resolve");
	});

	it("records the cached resolution failure as an error", async () => {
		// resolveProjects cached the failure; syncProject must surface it per
		// repo, or a repo tracking a closed project reports success.
		const cache = new Map([[7, { ok: false as const, error: 'Project "Roadmap" is closed' }]]);
		const result = await syncProject("acme", "r", "REPO_NODE", 7, cache, false, false).pipe(
			Effect.provide(githubTestLayer({})),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("skipped");
		expect(result.errors).toEqual([{ target: "project", operation: "resolve", error: 'Project "Roadmap" is closed' }]);
	});

	it("reports an error when the repository node id is empty", async () => {
		const result = await syncProject("acme", "r", "", 7, cacheWithRoadmap(), false, false).pipe(
			Effect.provide(githubTestLayer({})),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("error");
		expect(result.projectTitle).toBe("Roadmap");
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.operation).toBe("link");
	});

	it("dry-run reports the link and counts open items without mutating", async () => {
		const graphqlCalls: Array<string> = [];
		const layer = githubTestLayer({
			graphqlCalls,
			paginate: {
				"GET /repos/{owner}/{repo}/issues": [
					{ id: 1, node_id: "I1", number: 1, title: "a", state: "open", labels: [], html_url: "u" },
					{ id: 2, node_id: "I2", number: 2, title: "b", state: "open", labels: [], html_url: "u" },
				],
			},
		});
		const result = await syncProject("acme", "r", "REPO_NODE", 7, cacheWithRoadmap(), true, false).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("dry-run");
		expect(result.itemsAdded).toBe(2);
		expect(graphqlCalls).toEqual([]);
	});

	it("skip-backfill links without touching items", async () => {
		const graphqlCalls: Array<string> = [];
		const layer = githubTestLayer({
			graphqlCalls,
			graphql: { linkRepoToProject: { ok: true, data: {} } },
		});
		const result = await syncProject("acme", "r", "REPO_NODE", 7, cacheWithRoadmap(), false, true).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("linked");
		expect(result.itemsAdded).toBe(0);
		expect(graphqlCalls).toEqual(["linkRepoToProject"]);
	});

	it("reports an error when linking fails and skips backfill", async () => {
		const graphqlCalls: Array<string> = [];
		const layer = githubTestLayer({
			graphqlCalls,
			graphql: { linkRepoToProject: { ok: false, kind: "rejected" } },
			paginate: {
				"GET /repos/{owner}/{repo}/issues": [
					{ id: 1, node_id: "I1", number: 1, title: "a", state: "open", labels: [], html_url: "u" },
				],
			},
		});
		const result = await syncProject("acme", "r", "REPO_NODE", 7, cacheWithRoadmap(), false, false).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("error");
		expect(result.itemsAdded).toBe(0);
		expect(graphqlCalls).toEqual(["linkRepoToProject"]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.target).toBe("project");
		expect(result.errors[0]?.operation).toBe("link");
	});

	it("records an error when adding an item fails", async () => {
		const layer = githubTestLayer({
			graphql: {
				linkRepoToProject: { ok: true, data: {} },
				addItemToProject: { ok: false, kind: "rejected" },
			},
			paginate: {
				"GET /repos/{owner}/{repo}/issues": [
					{ id: 1, node_id: "I1", number: 1, title: "a", state: "open", labels: [], html_url: "u" },
				],
			},
		});
		const result = await syncProject("acme", "r", "REPO_NODE", 7, cacheWithRoadmap(), false, false).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.itemsAdded).toBe(0);
		expect(result.itemsAlreadyPresent).toBe(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.operation).toBe("add-item");
	});

	it("records an error when the open-issue listing fails", async () => {
		const layer = githubTestLayer({
			graphql: { linkRepoToProject: { ok: true, data: {} } },
			paginate: {
				"GET /repos/{owner}/{repo}/issues": GitHubError.rejected("GitHubIssue.list", 500, "boom"),
			},
		});
		const result = await syncProject("acme", "r", "REPO_NODE", 7, cacheWithRoadmap(), false, false).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("linked");
		expect(result.itemsAdded).toBe(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.operation).toBe("list-issues");
	});
});
