import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { discoverByCustomProperties } from "../../src/discovery/customProperties.js";
import { githubTestLayer } from "../test-support.js";

const run = (rows: ReadonlyArray<unknown>, filters: ReadonlyArray<{ key: string; value: string }>) =>
	discoverByCustomProperties("acme", filters).pipe(
		Effect.provide(githubTestLayer({ paginate: { "GET /orgs/{org}/properties/values": rows } })),
		Effect.provide(Logger.layer([])),
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
		expect(result[0]?.customProperties).toEqual({ workflow: "Standard" });
		expect(result[0]?.nodeId).toBe("na");
	});

	it("requires every filter to match, not merely one", async () => {
		const rows = [
			{
				repository_id: 1,
				repository_name: "a",
				repository_full_name: "acme/a",
				repository_node_id: "na",
				properties: [{ property_name: "workflow", value: "standard" }],
			},
		];
		const result = await run(rows, [
			{ key: "workflow", value: "standard" },
			{ key: "team", value: "platform" },
		]);
		expect(result).toEqual([]);
	});

	it("returns [] when no filters provided", async () => {
		const result = await run([], []);
		expect(result).toEqual([]);
	});
});
