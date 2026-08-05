import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { RepoSnapshot } from "../github/reads.js";
import { githubTestLayer } from "../test-support.js";
import { syncSettings } from "./settings.js";

const currentRepo: RepoSnapshot = {
	node_id: "n",
	name: "r",
	full_name: "acme/r",
	owner: { login: "acme" },
	has_wiki: true,
	has_issues: true,
	allow_squash_merge: true,
};

const layerWithUpdate = githubTestLayer({
	request: { "PATCH /repos/{owner}/{repo}": { ...currentRepo, has_wiki: false } },
});

const run = (dryRun: boolean) =>
	syncSettings({ has_wiki: false }, currentRepo, dryRun).pipe(
		Effect.provide(layerWithUpdate),
		Effect.provide(Logger.layer([])),
		Effect.runPromise,
	);

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
		const { changes, applied } = await syncSettings({ has_wiki: true }, currentRepo, false).pipe(
			Effect.provide(githubTestLayer({})),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(changes).toEqual([]);
		expect(applied).toBe(true);
	});

	it("ignores a key the config does not mention", async () => {
		const { changes } = await syncSettings({}, currentRepo, false).pipe(
			Effect.provide(githubTestLayer({})),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(changes).toEqual([]);
	});

	it("reports applied=false when the update is rejected", async () => {
		// No PATCH fixture -> the update fails; the drift is still reported.
		const { changes, applied } = await syncSettings({ has_wiki: false }, currentRepo, false).pipe(
			Effect.provide(githubTestLayer({})),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(changes).toHaveLength(1);
		expect(applied).toBe(false);
	});
});
