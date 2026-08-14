import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { GitHubError } from "@effected/github";
import { ActionEnvironment, ActionInput, ActionLogger, ActionOutputs } from "@effected/github-actions";
import { Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { program } from "../src/program.js";
import type { SilkConfig } from "../src/schemas.js";
import type { GitHubTestOptions } from "./test-support.js";
import { githubTestLayer } from "./test-support.js";

const config: SilkConfig = { labels: [{ name: "bug", description: "", color: "d73a4a" }], settings: {} };

/**
 * The config is read from a real file through the real `NodeFileSystem`.
 *
 * @remarks
 * `ConfigFile.read` is a filesystem claim, so a filesystem double would only
 * assert the double. Writing a real file costs one line and exercises the
 * decode path for real.
 */
const configFile = (contents: string = JSON.stringify(config)): string => {
	const dir = mkdtempSync(join(tmpdir(), "silk-sync-"));
	const path = join(dir, "silk.config.json");
	writeFileSync(path, contents, "utf-8");
	return path;
};

interface Recorded {
	readonly outputs: Array<{ readonly name: string; readonly value: string }>;
	readonly failures: Array<string>;
	readonly summaries: Array<string>;
}

const arrange = (options: {
	readonly inputs: Record<string, string>;
	readonly github?: GitHubTestOptions;
	readonly recorded: Recorded;
}) =>
	Layer.mergeAll(
		ActionInput.layer(options.inputs),
		ActionEnvironment.layerTest({ GITHUB_REPOSITORY: "acme/a", GITHUB_REPOSITORY_OWNER: "acme" }),
		ActionLogger.layerTest(),
		ActionOutputs.layerTest({
			set: (name, value) =>
				Effect.sync(() => {
					options.recorded.outputs.push({ name, value });
				}),
			setJson: (name, value) =>
				Effect.sync(() => {
					options.recorded.outputs.push({ name, value: JSON.stringify(value) });
				}),
			summary: (content) =>
				Effect.sync(() => {
					options.recorded.summaries.push(content);
				}),
			setFailed: (message) =>
				Effect.sync(() => {
					options.recorded.failures.push(message);
				}),
		}),
		NodeFileSystem.layer,
		githubTestLayer(options.github ?? {}),
	);

const emptyRecord = (): Recorded => ({ outputs: [], failures: [], summaries: [] });
const outputValue = (recorded: Recorded, name: string): string | undefined =>
	recorded.outputs.find((o) => o.name === name)?.value;

describe("program", () => {
	it("discovers, syncs, and sets every declared output", async () => {
		const recorded = emptyRecord();
		const layer = arrange({
			inputs: { repos: "a", "config-file": configFile() },
			github: {
				request: {
					"GET /repos/{owner}/{repo}": { node_id: "N", name: "a", full_name: "acme/a", owner: { login: "acme" } },
					"POST /repos/{owner}/{repo}/labels": {},
				},
				paginate: { "GET /repos/{owner}/{repo}/labels": [] },
			},
			recorded,
		});

		await program.pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);

		expect(recorded.failures).toEqual([]);
		expect(outputValue(recorded, "success")).toBe("true");
		expect(outputValue(recorded, "repos-total")).toBe("1");
		expect(outputValue(recorded, "repos-succeeded")).toBe("1");
		expect(outputValue(recorded, "repos-failed")).toBe("0");
		expect(outputValue(recorded, "results")).toContain('"success":true');
		// All five declared outputs, and nothing else.
		expect(recorded.outputs.map((o) => o.name).sort()).toEqual([
			"repos-failed",
			"repos-succeeded",
			"repos-total",
			"results",
			"success",
		]);
	});

	it("writes the step summary", async () => {
		const recorded = emptyRecord();
		const layer = arrange({
			inputs: { repos: "a", "config-file": configFile() },
			github: {
				request: {
					"GET /repos/{owner}/{repo}": { node_id: "N", name: "a", full_name: "acme/a", owner: { login: "acme" } },
					"POST /repos/{owner}/{repo}/labels": {},
				},
				paginate: { "GET /repos/{owner}/{repo}/labels": [] },
			},
			recorded,
		});
		await program.pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);
		expect(recorded.summaries[0]).toContain("## Silk Sync");
		expect(recorded.summaries[0]).toContain("| Repositories | Count |");
	});

	it("fails the action when discovery fails", async () => {
		const recorded = emptyRecord();
		// The custom-properties read rejects -> discovery fails.
		const layer = arrange({
			inputs: { "custom-properties": "workflow=standard", "config-file": configFile() },
			github: {
				paginate: {
					"GET /orgs/{org}/properties/values": GitHubError.rejected("listPropertyValues", 403, "Forbidden"),
				},
			},
			recorded,
		});

		await program.pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);

		expect(recorded.failures).toHaveLength(1);
		expect(recorded.failures[0]).toContain("Sync failed");
	});

	it("fails the action when the config file cannot be read", async () => {
		const recorded = emptyRecord();
		const layer = arrange({ inputs: { repos: "a", "config-file": "/nope/missing.json" }, recorded });
		await program.pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);
		expect(recorded.failures[0]).toContain("Sync failed");
	});

	it("resolves and links projects for project-tracking repos", async () => {
		const recorded = emptyRecord();
		const graphqlCalls: Array<string> = [];
		const layer = arrange({
			inputs: { "custom-properties": "project-tracking=true", "config-file": configFile() },
			github: {
				graphqlCalls,
				graphql: {
					resolveProject: {
						ok: true,
						data: { organization: { projectV2: { id: "P9", title: "Board", number: 9, closed: false } } },
					},
					linkRepoToProject: { ok: true, data: {} },
				},
				request: {
					"GET /repos/{owner}/{repo}": { node_id: "RNODE", name: "a", full_name: "acme/a", owner: { login: "acme" } },
					"POST /repos/{owner}/{repo}/labels": {},
				},
				paginate: {
					"GET /orgs/{org}/properties/values": [
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
					"GET /repos/{owner}/{repo}/labels": [],
					"GET /repos/{owner}/{repo}/issues": [],
				},
			},
			recorded,
		});

		await program.pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);

		expect(recorded.failures).toEqual([]);
		expect(outputValue(recorded, "success")).toBe("true");
		expect(graphqlCalls).toContain("resolveProject");
		expect(graphqlCalls).toContain("linkRepoToProject");
	});

	it("does not resolve projects when sync-projects is off", async () => {
		const recorded = emptyRecord();
		const graphqlCalls: Array<string> = [];
		const layer = arrange({
			inputs: { repos: "a", "sync-projects": "false", "config-file": configFile() },
			github: {
				graphqlCalls,
				request: {
					"GET /repos/{owner}/{repo}": { node_id: "N", name: "a", full_name: "acme/a", owner: { login: "acme" } },
					"POST /repos/{owner}/{repo}/labels": {},
				},
				paginate: { "GET /repos/{owner}/{repo}/labels": [] },
			},
			recorded,
		});
		await program.pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);
		expect(graphqlCalls).toEqual([]);
	});

	it("reports a per-repo failure without failing the action", async () => {
		const recorded = emptyRecord();
		// The repo resolves for discovery but the label create rejects.
		const layer = arrange({
			inputs: { repos: "a", "config-file": configFile() },
			github: {
				request: {
					"GET /repos/{owner}/{repo}": { node_id: "N", name: "a", full_name: "acme/a", owner: { login: "acme" } },
					"POST /repos/{owner}/{repo}/labels": GitHubError.rejected(
						"GitHubRepository.createLabel",
						422,
						"Validation failed",
					),
				},
				paginate: { "GET /repos/{owner}/{repo}/labels": [] },
			},
			recorded,
		});
		await program.pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise);
		// The label create rejected, so the one repo records an error.
		expect(recorded.failures).toEqual([]);
		expect(outputValue(recorded, "success")).toBe("false");
		expect(outputValue(recorded, "repos-failed")).toBe("1");
	});
});
