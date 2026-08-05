import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { DiscoveredRepo, SilkConfig } from "../../src/schemas.js";
import { processRepos } from "../../src/sync/processRepos.js";
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

describe("processRepos", () => {
	it("processes every repo and returns one result each, in order", async () => {
		const layer = githubTestLayer({
			request: {
				"GET /repos/{owner}/{repo}": { node_id: "N", name: "r", full_name: "acme/r", owner: { login: "acme" } },
			},
			paginate: { "GET /repos/{owner}/{repo}/labels": [] },
		});
		const results = await processRepos(repos, config, new Map(), inputs).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(results).toHaveLength(2);
		expect(results.map((r) => r.repo)).toEqual(["r1", "r2"]);
	});

	it("still returns a result for a repo whose reads all fail", async () => {
		// Nothing is seeded, so every read fails — and the run does not.
		const results = await processRepos(repos, config, new Map(), inputs).pipe(
			Effect.provide(githubTestLayer({})),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(results).toHaveLength(2);
		expect(results.every((r) => r.success === false)).toBe(true);
	});
});
