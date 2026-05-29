import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { LabelDefinition } from "../schemas.js";
import { syncLabels } from "./labels.js";

const desired: LabelDefinition[] = [
	{ name: "bug", description: "A bug", color: "d73a4a" },
	{ name: "feature", description: "New", color: "0e8a16" },
];

const run = (existing: unknown[], opts: { dryRun: boolean; removeCustom: boolean }) => {
	const layer = GitHubClientTest.layer({
		restResponses: new Map([
			["issues.createLabel", { data: {} }],
			["issues.updateLabel", { data: {} }],
			["issues.deleteLabel", { data: {} }],
		]),
		graphqlResponses: new Map(),
		paginateResponses: new Map([["issues.listLabelsForRepo", [existing]]]),
		repo: { owner: "o", repo: "r" },
	});
	return syncLabels("o", "r", desired, opts.dryRun, opts.removeCustom).pipe(
		Effect.provide(layer),
		Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
		Effect.runPromise,
	);
};

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

	it("reports custom labels and removes them when removeCustom=true", async () => {
		const existing = [{ id: 9, name: "wontfix", description: "", color: "ffffff" }];
		const { results, customLabels } = await run(existing, { dryRun: false, removeCustom: true });
		expect(customLabels).toContain("wontfix");
		expect(results.some((r) => r.name === "wontfix" && r.operation === "removed")).toBe(true);
	});

	it("dry-run reports intended ops without applying", async () => {
		const { results } = await run([], { dryRun: true, removeCustom: false });
		expect(results.filter((r) => r.operation === "created")).toHaveLength(2);
	});
});
