import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { getRepo, listLabels, listOrgRepoProperties } from "../../src/github/reads.js";
import { githubTestLayer } from "../test-support.js";

describe("github reads", () => {
	it("getRepo reads the ambient repository through the typed route", async () => {
		const layer = githubTestLayer({
			request: {
				"GET /repos/{owner}/{repo}": { node_id: "n1", name: "r", full_name: "acme/r", owner: { login: "acme" } },
			},
		});
		const data = await getRepo.pipe(Effect.provide(layer), Effect.runPromise);
		expect(data.full_name).toBe("acme/r");
		expect(data.node_id).toBe("n1");
	});

	it("listLabels pages the labels route for real", async () => {
		const layer = githubTestLayer({
			paginate: {
				"GET /repos/{owner}/{repo}/labels": [
					{ id: 1, name: "bug", description: "", color: "d73a4a" },
					{ id: 2, name: "chore", description: null, color: "ffffff" },
				],
			},
		});
		const labels = await listLabels.pipe(Effect.provide(layer), Effect.runPromise);
		expect(labels.map((l) => l.name)).toEqual(["bug", "chore"]);
	});

	it("listOrgRepoProperties recovers repository_node_id, which octokit's type omits", async () => {
		const layer = githubTestLayer({
			paginate: {
				"GET /orgs/{org}/properties/values": [
					{
						repository_id: 1,
						repository_name: "a",
						repository_full_name: "acme/a",
						repository_node_id: "NODE_A",
						properties: [{ property_name: "workflow", value: "standard" }],
					},
				],
			},
		});
		const rows = await listOrgRepoProperties("acme").pipe(Effect.provide(layer), Effect.runPromise);
		expect(rows[0]?.repository_node_id).toBe("NODE_A");
	});

	it("listOrgRepoProperties narrows a non-string property value to null", async () => {
		const layer = githubTestLayer({
			paginate: {
				"GET /orgs/{org}/properties/values": [
					{
						repository_id: 1,
						repository_name: "a",
						repository_full_name: "acme/a",
						properties: [{ property_name: "teams", value: ["platform"] }],
					},
				],
			},
		});
		const rows = await listOrgRepoProperties("acme").pipe(Effect.provide(layer), Effect.runPromise);
		expect(rows[0]?.properties[0]?.value).toBeNull();
		// The row carried no node id at all, so the recovered value is the empty
		// string rather than `undefined` leaking downstream.
		expect(rows[0]?.repository_node_id).toBe("");
	});
});
