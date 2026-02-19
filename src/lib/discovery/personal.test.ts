import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { GitHubApiError } from "../schemas/errors.js";
import { makeMockRestLayer } from "../test-helpers.js";
import { discoverByExplicitList } from "./personal.js";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
	debug: vi.fn(),
	isDebug: () => false,
	getInput: () => "",
}));

describe("discoverByExplicitList", () => {
	it("returns empty for empty input", async () => {
		const layer = makeMockRestLayer();
		const result = await Effect.runPromise(discoverByExplicitList("org", []).pipe(Effect.provide(layer)));
		expect(result).toEqual([]);
	});

	it("handles not-found repos", async () => {
		const layer = makeMockRestLayer({
			getRepo: () => Effect.fail(new GitHubApiError({ operation: "getRepo", statusCode: 404, reason: "Not Found" })),
		});

		const exit = await Effect.runPromiseExit(
			discoverByExplicitList("org", ["missing-repo"]).pipe(Effect.provide(layer)),
		);
		expect(exit._tag).toBe("Failure");
	});

	it("handles non-404 API errors", async () => {
		const layer = makeMockRestLayer({
			getRepo: () => Effect.fail(new GitHubApiError({ operation: "getRepo", statusCode: 500, reason: "Server error" })),
		});

		const exit = await Effect.runPromiseExit(discoverByExplicitList("org", ["bad-repo"]).pipe(Effect.provide(layer)));
		expect(exit._tag).toBe("Failure");
	});

	it("succeeds with mix of valid and invalid repos", async () => {
		let callCount = 0;
		const layer = makeMockRestLayer({
			getRepo: (owner, repo) => {
				callCount++;
				if (repo === "missing") {
					return Effect.fail(new GitHubApiError({ operation: "getRepo", statusCode: 404, reason: "Not Found" }));
				}
				return Effect.succeed({
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
				});
			},
		});

		const result = await Effect.runPromise(
			discoverByExplicitList("org", ["good-repo", "missing"]).pipe(Effect.provide(layer)),
		);
		expect(callCount).toBe(2);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("good-repo");
	});

	it("parses owner/repo format", async () => {
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

		const result = await Effect.runPromise(
			discoverByExplicitList("default-org", ["other-org/repo-x"]).pipe(Effect.provide(layer)),
		);
		expect(result).toHaveLength(1);
		expect(result[0].owner).toBe("other-org");
	});
});
