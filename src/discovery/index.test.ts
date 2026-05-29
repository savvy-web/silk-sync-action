import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Exit, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { discoverRepos } from "./index.js";

const run = (opts: { customProperties: { key: string; value: string }[]; repos: string[] }) => {
	const layer = GitHubClientTest.layer({
		restResponses: new Map([
			["repos.get", { data: { node_id: "ne", name: "a", full_name: "acme/a", owner: { login: "acme" } } }],
		]),
		graphqlResponses: new Map(),
		paginateResponses: new Map([
			[
				"orgs.listCustomPropertiesValues",
				[
					[
						{
							repository_id: 1,
							repository_name: "a",
							repository_full_name: "acme/a",
							repository_node_id: "na",
							properties: [{ property_name: "workflow", value: "standard" }],
						},
					],
				],
			],
		]),
		repo: { owner: "acme", repo: "a" },
	});
	return discoverRepos("acme", opts).pipe(
		Effect.provide(layer),
		Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
		Effect.runPromiseExit,
	);
};

describe("discoverRepos", () => {
	it("dedupes by fullName and keeps org custom properties on conflict", async () => {
		const exit = await run({ customProperties: [{ key: "workflow", value: "standard" }], repos: ["a"] });
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) {
			expect(exit.value).toHaveLength(1);
			expect(exit.value[0].customProperties).toEqual({ workflow: "standard" });
		}
	});

	it("fails when zero repos discovered", async () => {
		const exit = await run({ customProperties: [], repos: [] });
		expect(Exit.isFailure(exit)).toBe(true);
	});
});
