import {
	ActionLoggerTest,
	ActionOutputsTest,
	ConfigLoaderTest,
	GitHubClientTest,
	GitHubGraphQLTest,
} from "@savvy-web/github-action-effects/testing";
import { ConfigProvider, Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { program } from "./program.js";
import type { SilkConfig } from "./schemas.js";

const config: SilkConfig = { labels: [{ name: "bug", description: "", color: "d73a4a" }], settings: {} };

const outputValue = (state: ReturnType<typeof ActionOutputsTest.empty>, name: string): string | undefined =>
	state.outputs.find((o) => o.name === name)?.value;

describe("program", () => {
	it("discovers, syncs, and sets outputs", async () => {
		const outputs = ActionOutputsTest.empty();
		const layer = Layer.mergeAll(
			ActionOutputsTest.layer(outputs),
			ActionLoggerTest.layer(ActionLoggerTest.empty()),
			ConfigLoaderTest.layer({ files: new Map([[".github/silk.config.json", JSON.stringify(config)]]) }),
			GitHubClientTest.layer({
				restResponses: new Map([
					["repos.get", { data: { node_id: "N", name: "a", full_name: "acme/a", owner: { login: "acme" } } }],
					["issues.createLabel", { data: {} }],
				]),
				graphqlResponses: new Map(),
				paginateResponses: new Map([["issues.listLabelsForRepo", [[]]]]),
				repo: { owner: "acme", repo: "a" },
			}),
			GitHubGraphQLTest.empty().layer,
		);
		const cfgProvider = ConfigProvider.fromUnknown({ repos: "a" });
		await program.pipe(
			Effect.provide(ConfigProvider.layer(cfgProvider)),
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(outputValue(outputs, "success")).toBe("true");
		expect(outputValue(outputs, "repos-total")).toBe("1");
		expect(outputValue(outputs, "results")).toContain('"success":true');
	});

	it("fails the action when discovery fails", async () => {
		const outputs = ActionOutputsTest.empty();
		const layer = Layer.mergeAll(
			ActionOutputsTest.layer(outputs),
			ActionLoggerTest.layer(ActionLoggerTest.empty()),
			ConfigLoaderTest.layer({ files: new Map([[".github/silk.config.json", JSON.stringify(config)]]) }),
			// orgs.listCustomPropertiesValues is NOT seeded -> discovery fails.
			GitHubClientTest.layer({
				restResponses: new Map(),
				graphqlResponses: new Map(),
				paginateResponses: new Map(),
				repo: { owner: "acme", repo: "a" },
			}),
			GitHubGraphQLTest.empty().layer,
		);
		const cfgProvider = ConfigProvider.fromUnknown({ "custom-properties": "workflow=standard" });
		await program.pipe(
			Effect.provide(ConfigProvider.layer(cfgProvider)),
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(outputs.failed.length).toBeGreaterThanOrEqual(1);
		expect(outputs.failed[0]).toContain("Sync failed");
	});

	it("resolves and links projects for project-tracking repos", async () => {
		const outputs = ActionOutputsTest.empty();
		const gql = GitHubGraphQLTest.empty();
		gql.state.queryResponses.set("resolveProject", {
			organization: { projectV2: { id: "P9", title: "Board", number: 9, closed: false } },
		});
		gql.state.mutationResponses.set("linkRepoToProject", { linkProjectV2ToRepository: { repository: { id: "r" } } });
		const layer = Layer.mergeAll(
			ActionOutputsTest.layer(outputs),
			ActionLoggerTest.layer(ActionLoggerTest.empty()),
			ConfigLoaderTest.layer({ files: new Map([[".github/silk.config.json", JSON.stringify(config)]]) }),
			GitHubClientTest.layer({
				restResponses: new Map([
					["repos.get", { data: { node_id: "RNODE", name: "a", full_name: "acme/a", owner: { login: "acme" } } }],
					["issues.createLabel", { data: {} }],
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
									properties: [
										{ property_name: "project-tracking", value: "true" },
										{ property_name: "project-number", value: "9" },
									],
								},
							],
						],
					],
					["issues.listLabelsForRepo", [[]]],
					["issues.listForRepo", [[]]],
				]),
				repo: { owner: "acme", repo: "a" },
			}),
			gql.layer,
		);
		const cfgProvider = ConfigProvider.fromUnknown({ "custom-properties": "project-tracking=true" });
		await program.pipe(
			Effect.provide(ConfigProvider.layer(cfgProvider)),
			Effect.provide(layer),
			Effect.provide(Logger.layer([])),
			Effect.runPromise,
		);
		expect(outputValue(outputs, "success")).toBe("true");
		expect(gql.state.queryCalls.map((c) => c.operation)).toContain("resolveProject");
		expect(gql.state.mutationCalls.map((c) => c.operation)).toContain("linkRepoToProject");
	});
});
