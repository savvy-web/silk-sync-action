import type { GitHubClientError } from "@savvy-web/github-action-effects";
import { GitHubClient } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import type { LabelDefinition } from "../schemas.js";

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

export interface GitHubLabel {
	readonly id: number;
	readonly name: string;
	readonly description: string | null;
	readonly color: string;
}

export interface GitHubIssue {
	readonly id: number;
	readonly node_id: string;
	readonly number: number;
	readonly title: string;
	readonly pull_request?: unknown;
}

export interface OrgRepoProperty {
	readonly repository_id: number;
	readonly repository_name: string;
	readonly repository_full_name: string;
	readonly repository_node_id: string;
	readonly properties: ReadonlyArray<{ readonly property_name: string; readonly value: string | null }>;
}

interface OrgRepoPropertyRow {
	repository_id: number;
	repository_name: string;
	repository_full_name: string;
	repository_node_id?: string;
	properties: Array<{ property_name: string; value: unknown }>;
}

interface RestOctokit {
	rest: {
		repos: { get: (p: unknown) => Promise<{ data: GitHubRepo }>; update: (p: unknown) => Promise<{ data: unknown }> };
		issues: Record<string, (p: unknown) => Promise<{ data: unknown }>>;
	};
}
interface PaginateOctokit<T> {
	rest: { issues: { [k: string]: (p: unknown) => Promise<{ data: T[] }> } };
}
interface RequestOctokit {
	request: (route: string, p: unknown) => Promise<{ data: unknown }>;
}

export const getRepo = (owner: string, repo: string): Effect.Effect<GitHubRepo, GitHubClientError, GitHubClient> =>
	Effect.flatMap(GitHubClient, (gh) =>
		gh.rest("repos.get", (octokit) => (octokit as RestOctokit).rest.repos.get({ owner, repo })),
	);

export const listLabels = (
	owner: string,
	repo: string,
): Effect.Effect<ReadonlyArray<GitHubLabel>, GitHubClientError, GitHubClient> =>
	Effect.flatMap(GitHubClient, (gh) =>
		gh.paginate<GitHubLabel>("issues.listLabelsForRepo", (octokit, page, perPage) =>
			(octokit as PaginateOctokit<GitHubLabel>).rest.issues.listLabelsForRepo({ owner, repo, per_page: perPage, page }),
		),
	);

export const createLabel = (
	owner: string,
	repo: string,
	label: LabelDefinition,
): Effect.Effect<void, GitHubClientError, GitHubClient> =>
	Effect.flatMap(GitHubClient, (gh) =>
		gh
			.rest("issues.createLabel", (octokit) =>
				(octokit as RestOctokit).rest.issues.createLabel({
					owner,
					repo,
					name: label.name,
					description: label.description,
					color: label.color,
				}),
			)
			.pipe(Effect.asVoid),
	);

export const updateLabel = (
	owner: string,
	repo: string,
	currentName: string,
	label: LabelDefinition,
): Effect.Effect<void, GitHubClientError, GitHubClient> =>
	Effect.flatMap(GitHubClient, (gh) =>
		gh
			.rest("issues.updateLabel", (octokit) =>
				(octokit as RestOctokit).rest.issues.updateLabel({
					owner,
					repo,
					name: currentName,
					new_name: label.name,
					description: label.description,
					color: label.color,
				}),
			)
			.pipe(Effect.asVoid),
	);

export const deleteLabel = (
	owner: string,
	repo: string,
	name: string,
): Effect.Effect<void, GitHubClientError, GitHubClient> =>
	Effect.flatMap(GitHubClient, (gh) =>
		gh
			.rest("issues.deleteLabel", (octokit) => (octokit as RestOctokit).rest.issues.deleteLabel({ owner, repo, name }))
			.pipe(Effect.asVoid),
	);

export const updateRepo = (
	owner: string,
	repo: string,
	settings: Record<string, unknown>,
): Effect.Effect<void, GitHubClientError, GitHubClient> =>
	Effect.flatMap(GitHubClient, (gh) =>
		gh
			.rest("repos.update", (octokit) => (octokit as RestOctokit).rest.repos.update({ owner, repo, ...settings }))
			.pipe(Effect.asVoid),
	);

export const listOpenIssues = (
	owner: string,
	repo: string,
): Effect.Effect<ReadonlyArray<GitHubIssue>, GitHubClientError, GitHubClient> =>
	Effect.flatMap(GitHubClient, (gh) =>
		gh.paginate<GitHubIssue>("issues.listForRepo", (octokit, page, perPage) =>
			(octokit as PaginateOctokit<GitHubIssue>).rest.issues.listForRepo({
				owner,
				repo,
				state: "open",
				per_page: perPage,
				page,
			}),
		),
	);

export const listOrgRepoProperties = (
	org: string,
): Effect.Effect<ReadonlyArray<OrgRepoProperty>, GitHubClientError, GitHubClient> =>
	Effect.flatMap(GitHubClient, (gh) =>
		gh
			.paginate<OrgRepoPropertyRow>(
				"orgs.listCustomPropertiesValues",
				(octokit, page, perPage) =>
					(octokit as RequestOctokit).request("GET /orgs/{org}/properties/values", {
						org,
						per_page: perPage,
						page,
					}) as Promise<{ data: OrgRepoPropertyRow[] }>,
			)
			.pipe(
				Effect.map((rows) =>
					rows.map((r) => ({
						repository_id: r.repository_id,
						repository_name: r.repository_name,
						repository_full_name: r.repository_full_name,
						repository_node_id: r.repository_node_id ?? "",
						properties: r.properties.map((p) => ({
							property_name: p.property_name,
							value: typeof p.value === "string" ? p.value : null,
						})),
					})),
				),
			),
	);
