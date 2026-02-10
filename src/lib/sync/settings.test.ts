import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { GitHubApiError } from "../schemas/errors.js";
import { makeDefaultRepo, makeMockRestLayer } from "../test-helpers.js";
import { syncSettings } from "./settings.js";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
	debug: vi.fn(),
	isDebug: () => false,
	getInput: () => "",
}));

describe("syncSettings", () => {
	it("detects settings drift", async () => {
		const layer = makeMockRestLayer();
		const repo = makeDefaultRepo("my-repo");

		const result = await Effect.runPromise(
			syncSettings("org", "my-repo", { has_wiki: false, delete_branch_on_merge: true }, repo, false).pipe(
				Effect.provide(layer),
			),
		);

		expect(result.changes.length).toBeGreaterThan(0);
		expect(result.changes.some((c) => c.key === "has_wiki")).toBe(true);
		expect(result.changes.some((c) => c.key === "delete_branch_on_merge")).toBe(true);
		expect(result.applied).toBe(true);
	});

	it("returns no changes when settings match", async () => {
		const layer = makeMockRestLayer();
		const repo = makeDefaultRepo("my-repo");

		const result = await Effect.runPromise(
			syncSettings("org", "my-repo", { has_wiki: true, has_issues: true }, repo, false).pipe(Effect.provide(layer)),
		);

		expect(result.changes).toHaveLength(0);
		expect(result.applied).toBe(true);
	});

	it("does not apply in dry-run mode", async () => {
		let updated = false;
		const layer = makeMockRestLayer({
			updateRepo: () => {
				updated = true;
				return Effect.void;
			},
		});
		const repo = makeDefaultRepo("my-repo");

		const result = await Effect.runPromise(
			syncSettings("org", "my-repo", { has_wiki: false }, repo, true).pipe(Effect.provide(layer)),
		);

		expect(result.changes).toHaveLength(1);
		expect(result.applied).toBe(false);
		expect(updated).toBe(false);
	});

	it("handles 422 org-enforced rejection", async () => {
		const layer = makeMockRestLayer({
			updateRepo: () =>
				Effect.fail(
					new GitHubApiError({
						operation: "updateRepo",
						statusCode: 422,
						reason: "web_commit_signoff_required is enforced",
					}),
				),
		});
		const repo = makeDefaultRepo("my-repo");

		const result = await Effect.runPromise(
			syncSettings("org", "my-repo", { has_wiki: false }, repo, false).pipe(Effect.provide(layer)),
		);

		expect(result.changes).toHaveLength(1);
		expect(result.applied).toBe(false);
	});

	it("only sends changed keys in patch", async () => {
		let patchedSettings: Record<string, unknown> = {};
		const layer = makeMockRestLayer({
			updateRepo: (_o, _r, settings) => {
				patchedSettings = settings;
				return Effect.void;
			},
		});
		const repo = makeDefaultRepo("my-repo");

		await Effect.runPromise(
			syncSettings("org", "my-repo", { has_wiki: false, has_issues: true }, repo, false).pipe(Effect.provide(layer)),
		);

		// has_issues matches (true === true), so only has_wiki should be sent
		expect(patchedSettings).toEqual({ has_wiki: false });
	});

	it("skips undefined desired settings", async () => {
		const layer = makeMockRestLayer();
		const repo = makeDefaultRepo("my-repo");

		const result = await Effect.runPromise(syncSettings("org", "my-repo", {}, repo, false).pipe(Effect.provide(layer)));

		expect(result.changes).toHaveLength(0);
	});
});
