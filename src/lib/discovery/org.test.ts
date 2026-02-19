import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { GitHubApiError } from "../schemas/errors.js";
import { makeMockRestLayer } from "../test-helpers.js";
import { discoverByCustomProperties } from "./org.js";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
	debug: vi.fn(),
	isDebug: () => false,
	getInput: () => "",
}));

describe("discoverByCustomProperties", () => {
	it("returns empty for empty properties", async () => {
		const layer = makeMockRestLayer();
		const result = await Effect.runPromise(discoverByCustomProperties("org", []).pipe(Effect.provide(layer)));
		expect(result).toEqual([]);
	});

	it("maps API errors to DiscoveryError", async () => {
		const layer = makeMockRestLayer({
			getOrgRepoProperties: () =>
				Effect.fail(new GitHubApiError({ operation: "getOrgRepoProperties", reason: "403 Forbidden" })),
		});

		const exit = await Effect.runPromiseExit(
			discoverByCustomProperties("org", [{ key: "workflow", value: "standard" }]).pipe(Effect.provide(layer)),
		);
		expect(exit._tag).toBe("Failure");
		if (exit._tag === "Failure") {
			expect(JSON.stringify(exit.cause)).toContain("DiscoveryError");
		}
	});

	it("filters repos matching all properties", async () => {
		const layer = makeMockRestLayer({
			getOrgRepoProperties: () =>
				Effect.succeed([
					{
						repository_id: 1,
						repository_name: "match",
						repository_full_name: "org/match",
						repository_node_id: "R_1",
						properties: [
							{ property_name: "team", value: "platform" },
							{ property_name: "env", value: "prod" },
						],
					},
					{
						repository_id: 2,
						repository_name: "partial",
						repository_full_name: "org/partial",
						repository_node_id: "R_2",
						properties: [
							{ property_name: "team", value: "platform" },
							{ property_name: "env", value: "staging" },
						],
					},
				]),
		});

		const result = await Effect.runPromise(
			discoverByCustomProperties("org", [
				{ key: "team", value: "platform" },
				{ key: "env", value: "prod" },
			]).pipe(Effect.provide(layer)),
		);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("match");
	});

	it("handles null property values", async () => {
		const layer = makeMockRestLayer({
			getOrgRepoProperties: () =>
				Effect.succeed([
					{
						repository_id: 1,
						repository_name: "repo",
						repository_full_name: "org/repo",
						repository_node_id: "R_1",
						properties: [{ property_name: "team", value: null }],
					},
				]),
		});

		const result = await Effect.runPromise(
			discoverByCustomProperties("org", [{ key: "team", value: "platform" }]).pipe(Effect.provide(layer)),
		);
		expect(result).toHaveLength(0);
	});
});
