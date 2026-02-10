import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { makeMockRestLayer } from "../test-helpers.js";
import { discoverRepos } from "./index.js";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
	debug: vi.fn(),
	isDebug: () => false,
	getInput: () => "",
}));

const baseInputs = {
	appId: "1",
	appPrivateKey: "k",
	configFile: "c",
	customProperties: [] as Array<{ key: string; value: string }>,
	repos: [] as string[],
	dryRun: false,
	removeCustomLabels: false,
	syncSettings: true,
	syncProjects: true,
	skipBackfill: false,
	logLevel: "info" as const,
	skipTokenRevoke: false,
};

describe("discoverRepos", () => {
	it("discovers repos by custom properties", async () => {
		const layer = makeMockRestLayer({
			getOrgRepoProperties: () =>
				Effect.succeed([
					{
						repository_id: 1,
						repository_name: "repo-a",
						repository_full_name: "org/repo-a",
						repository_node_id: "R_a",
						properties: [{ property_name: "workflow", value: "standard" }],
					},
					{
						repository_id: 2,
						repository_name: "repo-b",
						repository_full_name: "org/repo-b",
						repository_node_id: "R_b",
						properties: [{ property_name: "workflow", value: "custom" }],
					},
				]),
		});

		const inputs = { ...baseInputs, customProperties: [{ key: "workflow", value: "standard" }] };
		const repos = await Effect.runPromise(discoverRepos("org", inputs).pipe(Effect.provide(layer)));

		expect(repos).toHaveLength(1);
		expect(repos[0].name).toBe("repo-a");
	});

	it("discovers repos by explicit list", async () => {
		const layer = makeMockRestLayer({
			getRepo: (owner, repo) =>
				Effect.succeed({
					node_id: `R_${repo}`,
					name: repo,
					full_name: `${owner}/${repo}`,
					owner: { login: owner },
					has_wiki: true,
					has_issues: true,
					has_projects: true,
					has_discussions: false,
					allow_merge_commit: true,
					allow_squash_merge: true,
					squash_merge_commit_title: "PR_TITLE",
					squash_merge_commit_message: "PR_BODY",
					allow_rebase_merge: true,
					allow_update_branch: false,
					delete_branch_on_merge: false,
					web_commit_signoff_required: false,
					allow_auto_merge: false,
				}),
		});

		const inputs = { ...baseInputs, repos: ["my-repo"] };
		const repos = await Effect.runPromise(discoverRepos("org", inputs).pipe(Effect.provide(layer)));

		expect(repos).toHaveLength(1);
		expect(repos[0].name).toBe("my-repo");
		expect(repos[0].owner).toBe("org");
	});

	it("deduplicates repos from both sources", async () => {
		const layer = makeMockRestLayer({
			getOrgRepoProperties: () =>
				Effect.succeed([
					{
						repository_id: 1,
						repository_name: "shared-repo",
						repository_full_name: "org/shared-repo",
						repository_node_id: "R_shared",
						properties: [{ property_name: "workflow", value: "standard" }],
					},
				]),
			getRepo: (owner, repo) =>
				Effect.succeed({
					node_id: `R_${repo}`,
					name: repo,
					full_name: `${owner}/${repo}`,
					owner: { login: owner },
					has_wiki: true,
					has_issues: true,
					has_projects: true,
					has_discussions: false,
					allow_merge_commit: true,
					allow_squash_merge: true,
					squash_merge_commit_title: "PR_TITLE",
					squash_merge_commit_message: "PR_BODY",
					allow_rebase_merge: true,
					allow_update_branch: false,
					delete_branch_on_merge: false,
					web_commit_signoff_required: false,
					allow_auto_merge: false,
				}),
		});

		const inputs = {
			...baseInputs,
			customProperties: [{ key: "workflow", value: "standard" }],
			repos: ["shared-repo"],
		};

		const repos = await Effect.runPromise(discoverRepos("org", inputs).pipe(Effect.provide(layer)));
		expect(repos).toHaveLength(1);
	});

	it("fails with DiscoveryError when no repos found", async () => {
		const layer = makeMockRestLayer({
			getOrgRepoProperties: () => Effect.succeed([]),
		});

		const inputs = { ...baseInputs, customProperties: [{ key: "workflow", value: "nonexistent" }] };
		const exit = await Effect.runPromiseExit(discoverRepos("org", inputs).pipe(Effect.provide(layer)));

		expect(exit._tag).toBe("Failure");
		if (exit._tag === "Failure") {
			const cause = exit.cause;
			// The error should be a DiscoveryError
			expect(JSON.stringify(cause)).toContain("DiscoveryError");
		}
	});
});
