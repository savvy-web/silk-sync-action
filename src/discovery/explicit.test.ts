import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Exit, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { discoverByExplicitList } from "./explicit.js";

const run = (repoResponse: unknown | undefined, names: string[]) => {
	const restResponses = new Map<string, { data: unknown }>();
	if (repoResponse !== undefined) restResponses.set("repos.get", { data: repoResponse });
	const layer = GitHubClientTest.layer({
		restResponses,
		graphqlResponses: new Map(),
		paginateResponses: new Map(),
		repo: { owner: "acme", repo: "x" },
	});
	return discoverByExplicitList("acme", names).pipe(
		Effect.provide(layer),
		Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
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
