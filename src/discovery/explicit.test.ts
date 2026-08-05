import { Effect, Exit, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { githubTestLayer } from "../test-support.js";
import { discoverByExplicitList } from "./explicit.js";

const run = (repoResponse: unknown | undefined, names: ReadonlyArray<string>) => {
	const layer = githubTestLayer(
		repoResponse === undefined ? {} : { request: { "GET /repos/{owner}/{repo}": repoResponse } },
	);
	return discoverByExplicitList("acme", names).pipe(
		Effect.provide(layer),
		Effect.provide(Logger.layer([])),
		Effect.runPromiseExit,
	);
};

describe("discoverByExplicitList", () => {
	it("maps a resolved repo to DiscoveredRepo with empty customProperties", async () => {
		const exit = await run({ node_id: "n1", name: "a", full_name: "acme/a", owner: { login: "acme" } }, ["a"]);
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) {
			expect(exit.value).toEqual([
				{ name: "a", owner: "acme", fullName: "acme/a", nodeId: "n1", customProperties: {} },
			]);
		}
	});

	it("fails with DiscoveryError when every repo fails to resolve", async () => {
		const exit = await run(undefined, ["a", "b"]);
		expect(Exit.isFailure(exit)).toBe(true);
	});

	it("returns [] for an empty name list", async () => {
		const exit = await run(undefined, []);
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) expect(exit.value).toEqual([]);
	});
});
