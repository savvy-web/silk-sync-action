import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { GitHubRepo } from "../github/reads.js";
import { syncSettings } from "./settings.js";

const currentRepo = { has_wiki: true, has_issues: true, allow_squash_merge: true } as unknown as GitHubRepo;

const run = (dryRun: boolean) => {
	const layer = GitHubClientTest.layer({
		restResponses: new Map([["repos.update", { data: {} }]]),
		graphqlResponses: new Map(),
		paginateResponses: new Map(),
		repo: { owner: "o", repo: "r" },
	});
	return syncSettings("o", "r", { has_wiki: false }, currentRepo, dryRun).pipe(
		Effect.provide(layer),
		Effect.provide(Logger.layer([])),
		Effect.runPromise,
	);
};

describe("syncSettings", () => {
	it("detects drift and applies the change", async () => {
		const { changes, applied } = await run(false);
		expect(changes).toEqual([{ key: "has_wiki", from: true, to: false }]);
		expect(applied).toBe(true);
	});

	it("dry-run reports the diff without applying", async () => {
		const { changes, applied } = await run(true);
		expect(changes).toHaveLength(1);
		expect(applied).toBe(false);
	});

	it("returns no changes when settings already match", async () => {
		const layer = GitHubClientTest.layer({
			restResponses: new Map(),
			graphqlResponses: new Map(),
			paginateResponses: new Map(),
			repo: { owner: "o", repo: "r" },
		});
		const { changes, applied } = await syncSettings("o", "r", { has_wiki: true }, currentRepo, false).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(changes).toEqual([]);
		expect(applied).toBe(true);
	});
});
