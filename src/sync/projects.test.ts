import { GitHubClientTest, GitHubGraphQLTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { ProjectCacheEntry } from "./projects.js";
import { resolveProjects, syncProject } from "./projects.js";

const baseRest = (issues: unknown[]) =>
	GitHubClientTest.layer({
		restResponses: new Map(),
		graphqlResponses: new Map(),
		paginateResponses: new Map([["issues.listForRepo", [issues]]]),
		repo: { owner: "acme", repo: "r" },
	});

describe("resolveProjects", () => {
	it("caches resolved projects", async () => {
		const gql = GitHubGraphQLTest.empty();
		gql.state.queryResponses.set("resolveProject", {
			organization: { projectV2: { id: "P1", title: "Roadmap", number: 7, closed: false } },
		});
		const cache = await resolveProjects("acme", [7]).pipe(
			Effect.provide(gql.layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
			Effect.runPromise,
		);
		expect(cache.get(7)).toEqual({
			ok: true,
			project: { id: "P1", title: "Roadmap", number: 7, closed: false },
		} satisfies ProjectCacheEntry);
	});
});

describe("syncProject", () => {
	it("links and backfills open items", async () => {
		const gql = GitHubGraphQLTest.empty();
		gql.state.mutationResponses.set("linkRepoToProject", { linkProjectV2ToRepository: { repository: { id: "r" } } });
		gql.state.mutationResponses.set("addItemToProject", { addProjectV2ItemById: { item: { id: "i" } } });
		const cache = new Map([
			[7, { ok: true as const, project: { id: "P1", title: "Roadmap", number: 7, closed: false } }],
		]);
		const layer = Layer.merge(gql.layer, baseRest([{ id: 1, node_id: "ISSUE_1", number: 1, title: "x" }]));

		const result = await syncProject("acme", "r", "REPO_NODE", 7, cache, false, false).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("linked");
		expect(result.itemsAdded).toBe(1);
		expect(gql.state.mutationCalls.map((c) => c.operation)).toEqual(["linkRepoToProject", "addItemToProject"]);
	});

	it("skips when the project is not in the cache", async () => {
		const gql = GitHubGraphQLTest.empty();
		const result = await syncProject("acme", "r", "REPO_NODE", 99, new Map(), false, false).pipe(
			Effect.provide(Layer.merge(gql.layer, baseRest([]))),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("skipped");
	});

	it("dry-run reports the link and counts open items without mutating", async () => {
		const gql = GitHubGraphQLTest.empty();
		const cache = new Map([
			[7, { ok: true as const, project: { id: "P1", title: "Roadmap", number: 7, closed: false } }],
		]);
		const layer = Layer.merge(
			gql.layer,
			baseRest([
				{ id: 1, node_id: "I1", number: 1, title: "a" },
				{ id: 2, node_id: "I2", number: 2, title: "b" },
			]),
		);
		const result = await syncProject("acme", "r", "REPO_NODE", 7, cache, true, false).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("dry-run");
		expect(result.itemsAdded).toBe(2);
		expect(gql.state.mutationCalls).toHaveLength(0);
	});

	it("reports an error when linking fails and skips backfill", async () => {
		const gql = GitHubGraphQLTest.empty(); // no linkRepoToProject response seeded -> mutation fails
		const cache = new Map([
			[7, { ok: true as const, project: { id: "P1", title: "Roadmap", number: 7, closed: false } }],
		]);
		const layer = Layer.merge(gql.layer, baseRest([{ id: 1, node_id: "I1", number: 1, title: "a" }]));
		const result = await syncProject("acme", "r", "REPO_NODE", 7, cache, false, false).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
			Effect.runPromise,
		);
		expect(result.linkStatus).toBe("error");
		expect(result.itemsAdded).toBe(0);
		expect(gql.state.mutationCalls.map((c) => c.operation)).toEqual(["linkRepoToProject"]);
	});
});
