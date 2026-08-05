import { Effect, Exit, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { githubTestLayer } from "../test-support.js";
import { discoverRepos } from "./index.js";

const layer = githubTestLayer({
	request: {
		"GET /repos/{owner}/{repo}": { node_id: "ne", name: "a", full_name: "acme/a", owner: { login: "acme" } },
	},
	paginate: {
		"GET /orgs/{org}/properties/values": [
			{
				repository_id: 1,
				repository_name: "a",
				repository_full_name: "acme/a",
				repository_node_id: "na",
				properties: [{ property_name: "workflow", value: "standard" }],
			},
		],
	},
});

const run = (opts: { customProperties: ReadonlyArray<{ key: string; value: string }>; repos: ReadonlyArray<string> }) =>
	discoverRepos("acme", opts).pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromiseExit);

describe("discoverRepos", () => {
	it("dedupes by fullName and keeps org custom properties on conflict", async () => {
		const exit = await run({ customProperties: [{ key: "workflow", value: "standard" }], repos: ["a"] });
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) {
			expect(exit.value).toHaveLength(1);
			expect(exit.value[0]?.customProperties).toEqual({ workflow: "standard" });
		}
	});

	it("matches case-insensitively when deduping", async () => {
		const exit = await run({ customProperties: [{ key: "workflow", value: "standard" }], repos: ["A"] });
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) expect(exit.value).toHaveLength(1);
	});

	it("fails when zero repos discovered", async () => {
		const exit = await run({ customProperties: [], repos: [] });
		expect(Exit.isFailure(exit)).toBe(true);
	});
});
