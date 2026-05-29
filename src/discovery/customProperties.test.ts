import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { discoverByCustomProperties } from "./customProperties.js";

const layerWith = (rows: unknown[]) =>
	GitHubClientTest.layer({
		restResponses: new Map(),
		graphqlResponses: new Map(),
		paginateResponses: new Map([["orgs.listCustomPropertiesValues", [rows]]]),
		repo: { owner: "acme", repo: "x" },
	});

const run = (rows: unknown[], filters: { key: string; value: string }[]) =>
	discoverByCustomProperties("acme", filters).pipe(
		Effect.provide(layerWith(rows)),
		Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
		Effect.runPromise,
	);

describe("discoverByCustomProperties", () => {
	it("matches repos satisfying ALL filters (case-insensitive)", async () => {
		const rows = [
			{
				repository_id: 1,
				repository_name: "a",
				repository_full_name: "acme/a",
				repository_node_id: "na",
				properties: [{ property_name: "workflow", value: "Standard" }],
			},
			{
				repository_id: 2,
				repository_name: "b",
				repository_full_name: "acme/b",
				repository_node_id: "nb",
				properties: [{ property_name: "workflow", value: "other" }],
			},
		];
		const result = await run(rows, [{ key: "workflow", value: "standard" }]);
		expect(result.map((r) => r.name)).toEqual(["a"]);
		expect(result[0].customProperties).toEqual({ workflow: "Standard" });
	});

	it("returns [] when no filters provided", async () => {
		const result = await run([], []);
		expect(result).toEqual([]);
	});
});
