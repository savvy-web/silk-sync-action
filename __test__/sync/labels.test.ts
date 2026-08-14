import { GitHubError } from "@effected/github";
import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { LabelDefinition } from "../../src/schemas.js";
import { syncLabels } from "../../src/sync/labels.js";
import { githubTestLayer } from "../test-support.js";

const desired: ReadonlyArray<LabelDefinition> = [
	{ name: "bug", description: "A bug", color: "d73a4a" },
	{ name: "feature", description: "New", color: "0e8a16" },
];

const MUTATIONS = {
	"POST /repos/{owner}/{repo}/labels": {},
	"PATCH /repos/{owner}/{repo}/labels/{name}": {},
	"DELETE /repos/{owner}/{repo}/labels/{name}": {},
};

const run = (existing: ReadonlyArray<unknown>, opts: { dryRun: boolean; removeCustom: boolean }) =>
	syncLabels("acme", "r", desired, opts.dryRun, opts.removeCustom).pipe(
		Effect.provide(
			githubTestLayer({
				request: MUTATIONS,
				paginate: { "GET /repos/{owner}/{repo}/labels": existing },
			}),
		),
		Effect.provide(Logger.layer([])),
		Effect.runPromise,
	);

describe("syncLabels", () => {
	it("creates missing, updates drifted, leaves matching unchanged", async () => {
		const existing = [
			{ id: 1, name: "bug", description: "A bug", color: "ffffff" }, // color drift -> updated
			{ id: 2, name: "feature", description: "New", color: "0e8a16" }, // identical -> unchanged
		];
		const { results } = await run(existing, { dryRun: false, removeCustom: false });
		const byName = Object.fromEntries(results.map((r) => [r.name, r.operation]));
		expect(byName.bug).toBe("updated");
		expect(byName.feature).toBe("unchanged");
	});

	it("records the drifted fields, in name/description/color order", async () => {
		const existing = [{ id: 1, name: "BUG", description: "old", color: "ffffff" }];
		const { results } = await run(existing, { dryRun: true, removeCustom: false });
		const bug = results.find((r) => r.name === "bug");
		expect(bug?.changes).toEqual(['name: "BUG" -> "bug"', "description", "color: #ffffff -> #d73a4a"]);
	});

	it("treats a null description as the empty string rather than drift", async () => {
		const existing = [{ id: 1, name: "bug", description: null, color: "d73a4a" }];
		const { results } = await run(existing, { dryRun: true, removeCustom: false });
		// "A bug" !== "" so this IS drift — but only on description, proving the
		// null was normalized rather than compared as `null`.
		expect(results.find((r) => r.name === "bug")?.changes).toEqual(["description"]);
	});

	it("reports custom labels and removes them when removeCustom=true", async () => {
		const existing = [{ id: 9, name: "wontfix", description: "", color: "ffffff" }];
		const { results, customLabels } = await run(existing, { dryRun: false, removeCustom: true });
		expect(customLabels).toContain("wontfix");
		expect(results.some((r) => r.name === "wontfix" && r.operation === "removed")).toBe(true);
	});

	it("reports custom labels but leaves them alone when removeCustom=false", async () => {
		const existing = [{ id: 9, name: "wontfix", description: "", color: "ffffff" }];
		const { results, customLabels } = await run(existing, { dryRun: false, removeCustom: false });
		expect(customLabels).toContain("wontfix");
		expect(results.some((r) => r.operation === "removed")).toBe(false);
	});

	it("dry-run reports intended ops without applying", async () => {
		const { results } = await run([], { dryRun: true, removeCustom: false });
		expect(results.filter((r) => r.operation === "created")).toHaveLength(2);
	});

	it("records an error and does not report success when a label API call fails", async () => {
		// The create endpoint rejects; every desired label is therefore an error.
		const { results, errors } = await syncLabels("acme", "r", desired, false, false).pipe(
			Effect.provide(
				githubTestLayer({
					request: {
						"POST /repos/{owner}/{repo}/labels": GitHubError.rejected(
							"GitHubRepository.createLabel",
							422,
							"Validation failed",
						),
					},
					paginate: { "GET /repos/{owner}/{repo}/labels": [] },
				}),
			),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(results.filter((r) => r.operation === "created")).toHaveLength(0);
		expect(errors).toHaveLength(2);
		expect(errors.every((e) => e.operation === "create")).toBe(true);
		expect(errors.map((e) => e.target).sort()).toEqual(["bug", "feature"]);
	});

	it("proceeds with an empty existing set when listing labels fails", async () => {
		// The paginated read fails, and the sync still runs, treating every
		// desired label as missing.
		const { results, customLabels } = await syncLabels("acme", "r", desired, true, true).pipe(
			Effect.provide(
				githubTestLayer({
					paginate: {
						"GET /repos/{owner}/{repo}/labels": GitHubError.rejected("GitHubRepository.listLabels", 403, "Forbidden"),
					},
				}),
			),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(results.filter((r) => r.operation === "created")).toHaveLength(2);
		expect(customLabels).toEqual([]);
	});
});
