import { GitHubClientTest, GitHubGraphQLTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { DiscoveredRepo, SilkConfig } from "../schemas.js";
import { processRepos } from "./processRepos.js";

const config: SilkConfig = { labels: [], settings: {} };
const repos: DiscoveredRepo[] = [
	{ name: "r1", owner: "acme", fullName: "acme/r1", nodeId: "N1", customProperties: {} },
	{ name: "r2", owner: "acme", fullName: "acme/r2", nodeId: "N2", customProperties: {} },
];

describe("processRepos", () => {
	it("processes every repo and returns one result each", async () => {
		const layer = Layer.merge(
			GitHubClientTest.layer({
				restResponses: new Map([
					["repos.get", { data: { node_id: "N", name: "r", full_name: "acme/r", owner: { login: "acme" } } }],
				]),
				graphqlResponses: new Map(),
				paginateResponses: new Map([["issues.listLabelsForRepo", [[]]]]),
				repo: { owner: "acme", repo: "r" },
			}),
			GitHubGraphQLTest.empty().layer,
		);
		const results = await processRepos(repos, config, new Map(), {
			dryRun: false,
			removeCustomLabels: false,
			syncSettings: false,
			syncProjects: false,
			skipBackfill: false,
		}).pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);
		expect(results).toHaveLength(2);
		expect(results.map((r) => r.repo)).toEqual(["r1", "r2"]);
	});
});
