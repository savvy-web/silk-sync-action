/**
 * Shared test helpers for creating mock Effect service layers.
 *
 * @module test-helpers
 */

import { Effect, Layer } from "effect";

import { GitHubApiError, GraphQLError } from "./schemas/errors.js";
import type {
	GitHubGraphQLClientService,
	GitHubIssue,
	GitHubLabel,
	GitHubRepo,
	GitHubRestClientService,
	OrgRepoProperty,
	RateLimitInfo,
} from "./services/types.js";
import { GitHubGraphQLClient, GitHubRestClient } from "./services/types.js";

// ---------------------------------------------------------------------------
// Mock REST client
// ---------------------------------------------------------------------------

const defaultRateLimit: RateLimitInfo = {
	core: { remaining: 5000, reset: Math.floor(Date.now() / 1000) + 3600 },
	graphql: { remaining: 5000, reset: Math.floor(Date.now() / 1000) + 3600 },
};

/** Create a default mock {@link GitHubRepo} for testing. */
export function makeDefaultRepo(name: string, owner = "test-org"): GitHubRepo {
	return {
		node_id: `R_${name}`,
		name,
		full_name: `${owner}/${name}`,
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
	};
}

/** Override options for the mock REST client. */
export interface MockRestOverrides {
	getOrgRepoProperties?: (org: string) => Effect.Effect<ReadonlyArray<OrgRepoProperty>, GitHubApiError>;
	getRepo?: (owner: string, repo: string) => Effect.Effect<GitHubRepo, GitHubApiError>;
	listLabels?: (owner: string, repo: string) => Effect.Effect<ReadonlyArray<GitHubLabel>, GitHubApiError>;
	createLabel?: GitHubRestClientService["createLabel"];
	updateLabel?: GitHubRestClientService["updateLabel"];
	deleteLabel?: GitHubRestClientService["deleteLabel"];
	updateRepo?: GitHubRestClientService["updateRepo"];
	listOpenIssues?: (
		owner: string,
		repo: string,
		page: number,
	) => Effect.Effect<ReadonlyArray<GitHubIssue>, GitHubApiError>;
	getRateLimit?: () => Effect.Effect<RateLimitInfo, GitHubApiError>;
}

/** Create a mock REST client layer with optional overrides. */
export function makeMockRestLayer(overrides: MockRestOverrides = {}): Layer.Layer<GitHubRestClient> {
	const fail = (op: string) => Effect.fail(new GitHubApiError({ operation: op, reason: "Not mocked" }));

	const service: GitHubRestClientService = {
		getOrgRepoProperties: overrides.getOrgRepoProperties ?? (() => fail("getOrgRepoProperties")),
		getRepo: overrides.getRepo ?? ((owner, repo) => Effect.succeed(makeDefaultRepo(repo, owner))),
		listLabels: overrides.listLabels ?? (() => Effect.succeed([])),
		createLabel: overrides.createLabel ?? (() => Effect.void),
		updateLabel: overrides.updateLabel ?? (() => Effect.void),
		deleteLabel: overrides.deleteLabel ?? (() => Effect.void),
		updateRepo: overrides.updateRepo ?? (() => Effect.void),
		listOpenIssues: overrides.listOpenIssues ?? (() => Effect.succeed([])),
		getRateLimit: overrides.getRateLimit ?? (() => Effect.succeed(defaultRateLimit)),
	};

	return Layer.succeed(GitHubRestClient, service);
}

// ---------------------------------------------------------------------------
// Mock GraphQL client
// ---------------------------------------------------------------------------

/** Override options for the mock GraphQL client. */
export interface MockGraphQLOverrides {
	resolveProject?: GitHubGraphQLClientService["resolveProject"];
	linkRepoToProject?: GitHubGraphQLClientService["linkRepoToProject"];
	addItemToProject?: GitHubGraphQLClientService["addItemToProject"];
}

/** Create a mock GraphQL client layer with optional overrides. */
export function makeMockGraphQLLayer(overrides: MockGraphQLOverrides = {}): Layer.Layer<GitHubGraphQLClient> {
	const fail = (op: string) => Effect.fail(new GraphQLError({ operation: op, reason: "Not mocked" }));

	const service: GitHubGraphQLClientService = {
		resolveProject: overrides.resolveProject ?? (() => fail("resolveProject")),
		linkRepoToProject: overrides.linkRepoToProject ?? (() => Effect.void),
		addItemToProject: overrides.addItemToProject ?? (() => Effect.void),
	};

	return Layer.succeed(GitHubGraphQLClient, service);
}

// ---------------------------------------------------------------------------
// Combined layer
// ---------------------------------------------------------------------------

/** Create a combined mock layer with both REST and GraphQL services. */
export function makeMockLayer(
	rest?: MockRestOverrides,
	graphql?: MockGraphQLOverrides,
): Layer.Layer<GitHubRestClient | GitHubGraphQLClient> {
	return Layer.mergeAll(makeMockRestLayer(rest), makeMockGraphQLLayer(graphql));
}
