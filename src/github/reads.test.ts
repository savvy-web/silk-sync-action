import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { getRepo, listLabels } from "./reads.js";

describe("github reads", () => {
	it("getRepo returns repo data keyed by 'repos.get'", async () => {
		const layer = GitHubClientTest.layer({
			restResponses: new Map([
				["repos.get", { data: { node_id: "n1", name: "r", full_name: "o/r", owner: { login: "o" } } }],
			]),
			graphqlResponses: new Map(),
			paginateResponses: new Map(),
			repo: { owner: "o", repo: "r" },
		});
		const data = await getRepo("o", "r").pipe(Effect.provide(layer), Effect.runPromise);
		expect(data.full_name).toBe("o/r");
	});

	it("listLabels collects paginated labels keyed by 'issues.listLabelsForRepo'", async () => {
		const layer = GitHubClientTest.layer({
			restResponses: new Map(),
			graphqlResponses: new Map(),
			paginateResponses: new Map([
				["issues.listLabelsForRepo", [[{ id: 1, name: "bug", description: "", color: "d73a4a" }]]],
			]),
			repo: { owner: "o", repo: "r" },
		});
		const labels = await listLabels("o", "r").pipe(Effect.provide(layer), Effect.runPromise);
		expect(labels).toHaveLength(1);
		expect(labels[0].name).toBe("bug");
	});
});
