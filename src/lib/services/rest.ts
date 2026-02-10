/**
 * GitHub REST client service implementation.
 *
 * @remarks
 * Wraps Octokit REST API calls with typed Effect errors. Each method
 * creates a fresh Octokit instance to avoid stale token issues.
 * Paginated endpoints loop until all pages are consumed.
 *
 * @module services/rest
 */

import { Octokit } from "@octokit/rest";
import { Effect, Layer } from "effect";

import { GitHubApiError } from "../schemas/errors.js";
import type { GitHubIssue, GitHubLabel, GitHubRepo, OrgRepoProperty, RateLimitInfo } from "./types.js";
import { GitHubRestClient } from "./types.js";

/**
 * Extract HTTP status code from an Octokit error, if present.
 */
function getStatusCode(error: unknown): number | undefined {
	return (error as { status?: number }).status;
}

/**
 * Create a live {@link GitHubRestClient} layer from a token.
 *
 * @param token - GitHub App installation token
 * @returns An Effect layer providing the REST client service
 *
 * @internal
 */
export function makeGitHubRestClientLayer(token: string): Layer.Layer<GitHubRestClient> {
	return Layer.succeed(GitHubRestClient, {
		getOrgRepoProperties: (org) =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					const results: OrgRepoProperty[] = [];
					let page = 1;

					while (true) {
						const { data } = await octokit.request("GET /orgs/{org}/properties/values", {
							org,
							per_page: 100,
							page,
						});

						for (const repo of data as Array<{
							repository_id: number;
							repository_name: string;
							repository_full_name: string;
							repository_node_id?: string;
							properties: Array<{ property_name: string; value: unknown }>;
						}>) {
							results.push({
								repository_id: repo.repository_id,
								repository_name: repo.repository_name,
								repository_full_name: repo.repository_full_name,
								repository_node_id: repo.repository_node_id ?? "",
								properties: repo.properties.map((p) => ({
									property_name: p.property_name,
									value: typeof p.value === "string" ? p.value : null,
								})),
							});
						}

						if ((data as unknown[]).length < 100) break;
						page++;
					}

					return results;
				},
				catch: (e) =>
					new GitHubApiError({
						operation: "orgs.listCustomPropertiesValuesForRepos",
						statusCode: getStatusCode(e),
						reason: String(e),
					}),
			}),

		getRepo: (owner, repo) =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					const { data } = await octokit.rest.repos.get({ owner, repo });
					return data as unknown as GitHubRepo;
				},
				catch: (e) =>
					new GitHubApiError({
						operation: "repos.get",
						statusCode: getStatusCode(e),
						reason: String(e),
					}),
			}),

		listLabels: (owner, repo) =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					const labels: GitHubLabel[] = [];
					let page = 1;

					while (true) {
						const { data } = await octokit.rest.issues.listLabelsForRepo({
							owner,
							repo,
							per_page: 100,
							page,
						});

						for (const label of data) {
							labels.push({
								id: label.id,
								name: label.name,
								description: label.description,
								color: label.color,
							});
						}

						if (data.length < 100) break;
						page++;
					}

					return labels;
				},
				catch: (e) =>
					new GitHubApiError({
						operation: "issues.listLabelsForRepo",
						statusCode: getStatusCode(e),
						reason: String(e),
					}),
			}),

		createLabel: (owner, repo, label) =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					await octokit.rest.issues.createLabel({
						owner,
						repo,
						name: label.name,
						description: label.description,
						color: label.color,
					});
				},
				catch: (e) =>
					new GitHubApiError({
						operation: "issues.createLabel",
						statusCode: getStatusCode(e),
						reason: String(e),
					}),
			}),

		updateLabel: (owner, repo, currentName, label) =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					await octokit.rest.issues.updateLabel({
						owner,
						repo,
						name: currentName,
						new_name: label.name,
						description: label.description,
						color: label.color,
					});
				},
				catch: (e) =>
					new GitHubApiError({
						operation: "issues.updateLabel",
						statusCode: getStatusCode(e),
						reason: String(e),
					}),
			}),

		deleteLabel: (owner, repo, name) =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					await octokit.rest.issues.deleteLabel({ owner, repo, name });
				},
				catch: (e) =>
					new GitHubApiError({
						operation: "issues.deleteLabel",
						statusCode: getStatusCode(e),
						reason: String(e),
					}),
			}),

		updateRepo: (owner, repo, settings) =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					await octokit.rest.repos.update({ owner, repo, ...settings });
				},
				catch: (e) =>
					new GitHubApiError({
						operation: "repos.update",
						statusCode: getStatusCode(e),
						reason: String(e),
					}),
			}),

		listOpenIssues: (owner, repo, page) =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					const { data } = await octokit.rest.issues.listForRepo({
						owner,
						repo,
						state: "open",
						per_page: 100,
						page,
					});

					return data.map((issue) => ({
						id: issue.id,
						node_id: issue.node_id,
						number: issue.number,
						title: issue.title,
						pull_request: issue.pull_request,
					})) as ReadonlyArray<GitHubIssue>;
				},
				catch: (e) =>
					new GitHubApiError({
						operation: "issues.listForRepo",
						statusCode: getStatusCode(e),
						reason: String(e),
					}),
			}),

		getRateLimit: () =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					const { data } = await octokit.rest.rateLimit.get();
					return {
						core: {
							remaining: data.resources.core.remaining,
							reset: data.resources.core.reset,
						},
						graphql: {
							remaining: data.resources.graphql?.remaining ?? 5000,
							reset: data.resources.graphql?.reset ?? 0,
						},
					} satisfies RateLimitInfo;
				},
				catch: (e) =>
					new GitHubApiError({
						operation: "rateLimit.get",
						statusCode: getStatusCode(e),
						reason: String(e),
					}),
			}),
	});
}
