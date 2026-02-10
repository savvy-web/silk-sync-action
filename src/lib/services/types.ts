/**
 * Service interface definitions and Context.Tags.
 *
 * Separated from implementations to avoid circular imports.
 *
 * @module services/types
 */

import type { Effect } from "effect";
import { Context } from "effect";
import type { GitHubApiError, GraphQLError } from "../schemas/errors.js";
import type { LabelDefinition, ProjectInfo } from "../schemas/index.js";

// ══════════════════════════════════════════════════════════════════════════════
// GitHub API Data Types
// ══════════════════════════════════════════════════════════════════════════════

/** Raw label data from the GitHub API. */
export interface GitHubLabel {
	readonly id: number;
	readonly name: string;
	readonly description: string | null;
	readonly color: string;
}

/** Raw repository data from the GitHub API. */
export interface GitHubRepo {
	readonly node_id: string;
	readonly name: string;
	readonly full_name: string;
	readonly owner: { readonly login: string };
	readonly has_wiki: boolean;
	readonly has_issues: boolean;
	readonly has_projects: boolean;
	readonly has_discussions: boolean;
	readonly allow_merge_commit: boolean;
	readonly allow_squash_merge: boolean;
	readonly squash_merge_commit_title: string;
	readonly squash_merge_commit_message: string;
	readonly allow_rebase_merge: boolean;
	readonly allow_update_branch: boolean;
	readonly delete_branch_on_merge: boolean;
	readonly web_commit_signoff_required: boolean;
	readonly allow_auto_merge: boolean;
}

/** Raw issue/PR data from the GitHub API. */
export interface GitHubIssue {
	readonly id: number;
	readonly node_id: string;
	readonly number: number;
	readonly title: string;
	readonly pull_request?: unknown;
}

/** Org repo custom property value entry. */
export interface OrgRepoProperty {
	readonly repository_id: number;
	readonly repository_name: string;
	readonly repository_full_name: string;
	readonly repository_node_id: string;
	readonly properties: ReadonlyArray<{
		readonly property_name: string;
		readonly value: string | null;
	}>;
}

/** Rate limit information. */
export interface RateLimitInfo {
	readonly core: { readonly remaining: number; readonly reset: number };
	readonly graphql: { readonly remaining: number; readonly reset: number };
}

// ══════════════════════════════════════════════════════════════════════════════
// GitHub REST Client Service
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GitHub REST API client service interface.
 */
export interface GitHubRestClientService {
	readonly getOrgRepoProperties: (org: string) => Effect.Effect<ReadonlyArray<OrgRepoProperty>, GitHubApiError>;
	readonly getRepo: (owner: string, repo: string) => Effect.Effect<GitHubRepo, GitHubApiError>;
	readonly listLabels: (owner: string, repo: string) => Effect.Effect<ReadonlyArray<GitHubLabel>, GitHubApiError>;
	readonly createLabel: (owner: string, repo: string, label: LabelDefinition) => Effect.Effect<void, GitHubApiError>;
	readonly updateLabel: (
		owner: string,
		repo: string,
		currentName: string,
		label: LabelDefinition,
	) => Effect.Effect<void, GitHubApiError>;
	readonly deleteLabel: (owner: string, repo: string, name: string) => Effect.Effect<void, GitHubApiError>;
	readonly updateRepo: (
		owner: string,
		repo: string,
		settings: Record<string, unknown>,
	) => Effect.Effect<void, GitHubApiError>;
	readonly listOpenIssues: (
		owner: string,
		repo: string,
		page: number,
	) => Effect.Effect<ReadonlyArray<GitHubIssue>, GitHubApiError>;
	readonly getRateLimit: () => Effect.Effect<RateLimitInfo, GitHubApiError>;
}

/**
 * GitHub REST client service tag.
 */
export class GitHubRestClient extends Context.Tag("GitHubRestClient")<GitHubRestClient, GitHubRestClientService>() {}

// ══════════════════════════════════════════════════════════════════════════════
// GitHub GraphQL Client Service
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GitHub GraphQL client service interface.
 */
export interface GitHubGraphQLClientService {
	readonly resolveProject: (org: string, projectNumber: number) => Effect.Effect<ProjectInfo, GraphQLError>;
	readonly linkRepoToProject: (projectId: string, repoNodeId: string) => Effect.Effect<void, GraphQLError>;
	readonly addItemToProject: (projectId: string, contentId: string) => Effect.Effect<void, GraphQLError>;
}

/**
 * GitHub GraphQL client service tag.
 */
export class GitHubGraphQLClient extends Context.Tag("GitHubGraphQLClient")<
	GitHubGraphQLClient,
	GitHubGraphQLClientService
>() {}
