import { GitHubClientTest, GitHubGraphQLTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { DiscoveredRepo, SilkConfig } from "../schemas.js";
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

describe("syncRepo", () => {
	it("syncs labels + settings and reports success", async () => {
		const layer = Layer.merge(
			GitHubClientTest.layer({
				restResponses: new Map([
					[
						"repos.get",
						{ data: { node_id: "RNODE", name: "r", full_name: "acme/r", owner: { login: "acme" }, has_wiki: true } },
					],
					["issues.createLabel", { data: {} }],
					["repos.update", { data: {} }],
				]),
				graphqlResponses: new Map(),
				paginateResponses: new Map([["issues.listLabelsForRepo", [[]]]]),
				repo: { owner: "acme", repo: "r" },
			}),
			GitHubGraphQLTest.empty().layer,
		);
		const result = await syncRepo(repo, config, new Map(), inputs).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
			Effect.runPromise,
		);
		expect(result.success).toBe(true);
		expect(result.labels.some((l) => l.name === "bug" && l.operation === "created")).toBe(true);
		expect(result.settingChanges).toHaveLength(1);
	});

	it("records an error when the repo fetch fails", async () => {
		const layer = Layer.merge(
			GitHubClientTest.layer({
				restResponses: new Map(),
				graphqlResponses: new Map(),
				paginateResponses: new Map([["issues.listLabelsForRepo", [[]]]]),
				repo: { owner: "acme", repo: "r" },
			}),
			GitHubGraphQLTest.empty().layer,
		);
		const result = await syncRepo(repo, config, new Map(), {
			...inputs,
			syncSettings: false,
			syncProjects: false,
		}).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
			Effect.runPromise,
		);
		expect(result.success).toBe(false);
		expect(result.errors[0].target).toBe("repo");
	});

	it("links a project-tracking repo to its project", async () => {
		const gql = GitHubGraphQLTest.empty();
		gql.state.mutationResponses.set("linkRepoToProject", { linkProjectV2ToRepository: { repository: { id: "r" } } });
		const trackingRepo = {
			...repo,
			customProperties: { "project-tracking": "true", "project-number": "5" },
		};
		const cache = new Map([
			[5, { ok: true as const, project: { id: "P5", title: "Board", number: 5, closed: false } }],
		]);
		const layer = Layer.merge(
			GitHubClientTest.layer({
				restResponses: new Map([
					["repos.get", { data: { node_id: "RNODE", name: "r", full_name: "acme/r", owner: { login: "acme" } } }],
				]),
				graphqlResponses: new Map(),
				paginateResponses: new Map([
					["issues.listLabelsForRepo", [[]]],
					["issues.listForRepo", [[]]],
				]),
				repo: { owner: "acme", repo: "r" },
			}),
			gql.layer,
		);
		const result = await syncRepo(trackingRepo, config, cache, {
			...inputs,
			syncSettings: false,
			skipBackfill: true,
		}).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
			Effect.runPromise,
		);
		expect(result.projectNumber).toBe(5);
		expect(result.projectLinkStatus).toBe("linked");
		expect(result.projectTitle).toBe("Board");
	});
});
