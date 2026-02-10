import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { GraphQLError } from "../schemas/errors.js";
import type { ProjectInfo } from "../schemas/index.js";
import { makeMockGraphQLLayer, makeMockLayer } from "../test-helpers.js";
import type { ProjectCache } from "./projects.js";
import { resolveProjects, syncProject } from "./projects.js";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
	debug: vi.fn(),
	isDebug: () => false,
	getInput: () => "",
}));

const mockProject: ProjectInfo = {
	id: "PVT_001",
	title: "Silk Suite",
	number: 1,
	closed: false,
};

describe("resolveProjects", () => {
	it("resolves a project and caches it", async () => {
		const layer = makeMockGraphQLLayer({
			resolveProject: () => Effect.succeed(mockProject),
		});

		const cache = await Effect.runPromise(resolveProjects("org", [1]).pipe(Effect.provide(layer)));

		expect(cache.size).toBe(1);
		const entry = cache.get(1);
		expect(entry?.ok).toBe(true);
		if (entry?.ok) expect(entry.project.title).toBe("Silk Suite");
	});

	it("handles closed projects", async () => {
		const layer = makeMockGraphQLLayer({
			resolveProject: () => Effect.succeed({ ...mockProject, closed: true }),
		});

		const cache = await Effect.runPromise(resolveProjects("org", [1]).pipe(Effect.provide(layer)));
		const entry = cache.get(1);
		expect(entry?.ok).toBe(false);
	});

	it("handles resolution failures", async () => {
		const layer = makeMockGraphQLLayer({
			resolveProject: () => Effect.fail(new GraphQLError({ operation: "resolve", reason: "Not found" })),
		});

		const cache = await Effect.runPromise(resolveProjects("org", [1]).pipe(Effect.provide(layer)));
		const entry = cache.get(1);
		expect(entry?.ok).toBe(false);
	});

	it("deduplicates project numbers", async () => {
		let calls = 0;
		const layer = makeMockGraphQLLayer({
			resolveProject: () => {
				calls++;
				return Effect.succeed(mockProject);
			},
		});

		await Effect.runPromise(resolveProjects("org", [1, 1, 1]).pipe(Effect.provide(layer)));
		expect(calls).toBe(1);
	});

	it("returns empty cache for no projects", async () => {
		const layer = makeMockGraphQLLayer();
		const cache = await Effect.runPromise(resolveProjects("org", []).pipe(Effect.provide(layer)));
		expect(cache.size).toBe(0);
	});
});

describe("syncProject", () => {
	const makeCache = (ok = true): ProjectCache => {
		const cache: ProjectCache = new Map();
		if (ok) {
			cache.set(1, { ok: true, project: mockProject });
		} else {
			cache.set(1, { ok: false, error: "Project not found" });
		}
		return cache;
	};

	it("links a repo to a project", async () => {
		let linked = false;
		const layer = makeMockLayer(
			{},
			{
				linkRepoToProject: () => {
					linked = true;
					return Effect.void;
				},
			},
		);

		const result = await Effect.runPromise(
			syncProject("org", "repo", "R_123", 1, makeCache(), false, false).pipe(Effect.provide(layer)),
		);

		expect(result.linkStatus).toBe("linked");
		expect(linked).toBe(true);
	});

	it("handles already-linked repos", async () => {
		const layer = makeMockLayer(
			{},
			{
				linkRepoToProject: () => Effect.fail(new GraphQLError({ operation: "link", reason: "already exists" })),
			},
		);

		const result = await Effect.runPromise(
			syncProject("org", "repo", "R_123", 1, makeCache(), false, false).pipe(Effect.provide(layer)),
		);

		expect(result.linkStatus).toBe("already");
	});

	it("skips when project not resolved", async () => {
		const layer = makeMockLayer();

		const result = await Effect.runPromise(
			syncProject("org", "repo", "R_123", 1, makeCache(false), false, false).pipe(Effect.provide(layer)),
		);

		expect(result.linkStatus).toBe("skipped");
	});

	it("skips backfill when flag is set", async () => {
		const layer = makeMockLayer({}, { linkRepoToProject: () => Effect.void });

		const result = await Effect.runPromise(
			syncProject("org", "repo", "R_123", 1, makeCache(), false, true).pipe(Effect.provide(layer)),
		);

		expect(result.linkStatus).toBe("linked");
		expect(result.itemsAdded).toBe(0);
	});

	it("backfills open issues", async () => {
		let addedCount = 0;
		const layer = makeMockLayer(
			{
				listOpenIssues: (_o, _r, page) => {
					if (page === 1) {
						return Effect.succeed([
							{ id: 1, node_id: "I_1", number: 1, title: "Issue 1" },
							{ id: 2, node_id: "I_2", number: 2, title: "Issue 2" },
						]);
					}
					return Effect.succeed([]);
				},
			},
			{
				linkRepoToProject: () => Effect.void,
				addItemToProject: () => {
					addedCount++;
					return Effect.void;
				},
			},
		);

		const result = await Effect.runPromise(
			syncProject("org", "repo", "R_123", 1, makeCache(), false, false).pipe(Effect.provide(layer)),
		);

		expect(result.itemsAdded).toBe(2);
		expect(addedCount).toBe(2);
	});

	it("counts already-present items during backfill", async () => {
		const layer = makeMockLayer(
			{
				listOpenIssues: () => Effect.succeed([{ id: 1, node_id: "I_1", number: 1, title: "Issue 1" }]),
			},
			{
				linkRepoToProject: () => Effect.void,
				addItemToProject: () => Effect.fail(new GraphQLError({ operation: "add", reason: "item already exists" })),
			},
		);

		const result = await Effect.runPromise(
			syncProject("org", "repo", "R_123", 1, makeCache(), false, false).pipe(Effect.provide(layer)),
		);

		expect(result.itemsAlreadyPresent).toBe(1);
		expect(result.itemsAdded).toBe(0);
	});

	it("dry-run does not call link or add mutations", async () => {
		let linkCalled = false;
		const layer = makeMockLayer(
			{
				listOpenIssues: () => Effect.succeed([{ id: 1, node_id: "I_1", number: 1, title: "Issue 1" }]),
			},
			{
				linkRepoToProject: () => {
					linkCalled = true;
					return Effect.void;
				},
			},
		);

		const result = await Effect.runPromise(
			syncProject("org", "repo", "R_123", 1, makeCache(), true, false).pipe(Effect.provide(layer)),
		);

		expect(result.linkStatus).toBe("dry-run");
		expect(linkCalled).toBe(false);
	});
});
