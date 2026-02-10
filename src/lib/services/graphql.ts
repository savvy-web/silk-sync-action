/**
 * GitHub GraphQL client service implementation.
 *
 * @remarks
 * Wraps GraphQL operations for Projects V2 with typed Effect errors.
 * Each method creates a fresh Octokit instance to avoid stale token issues.
 *
 * @module services/graphql
 */

import { Octokit } from "@octokit/rest";
import { Effect, Layer } from "effect";
import { GraphQLError } from "../schemas/errors.js";
import type { ProjectInfo } from "../schemas/index.js";
import { GitHubGraphQLClient } from "./types.js";

// ---------------------------------------------------------------------------
// GraphQL Queries & Mutations
// ---------------------------------------------------------------------------

const RESOLVE_PROJECT_QUERY = `
  query ResolveProject($org: String!, $number: Int!) {
    organization(login: $org) {
      projectV2(number: $number) {
        id
        title
        number
        closed
      }
    }
  }
`;

const LINK_REPO_MUTATION = `
  mutation LinkRepoToProject($projectId: ID!, $repositoryId: ID!) {
    linkProjectV2ToRepository(input: {
      projectId: $projectId
      repositoryId: $repositoryId
    }) {
      repository { id }
    }
  }
`;

const ADD_ITEM_MUTATION = `
  mutation AddItemToProject($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: {
      projectId: $projectId
      contentId: $contentId
    }) {
      item { id }
    }
  }
`;

// ---------------------------------------------------------------------------
// GraphQL Response Types
// ---------------------------------------------------------------------------

interface ResolveProjectResponse {
	organization: {
		projectV2: {
			id: string;
			title: string;
			number: number;
			closed: boolean;
		} | null;
	};
}

// ---------------------------------------------------------------------------
// Layer Implementation
// ---------------------------------------------------------------------------

/**
 * Create a live {@link GitHubGraphQLClient} layer from a token.
 *
 * @param token - GitHub App installation token
 * @returns An Effect layer providing the GraphQL client service
 *
 * @internal
 */
export function makeGitHubGraphQLClientLayer(token: string): Layer.Layer<GitHubGraphQLClient> {
	return Layer.succeed(GitHubGraphQLClient, {
		resolveProject: (org, projectNumber) =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					const data = await octokit.graphql<ResolveProjectResponse>(RESOLVE_PROJECT_QUERY, {
						org,
						number: projectNumber,
					});

					const project = data.organization.projectV2;
					if (!project) {
						throw new Error(`Project #${projectNumber} not found in org "${org}"`);
					}

					return {
						id: project.id,
						title: project.title,
						number: project.number,
						closed: project.closed,
					} satisfies ProjectInfo;
				},
				catch: (e) =>
					new GraphQLError({
						operation: "resolveProject",
						reason: String(e),
					}),
			}),

		linkRepoToProject: (projectId, repoNodeId) =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					await octokit.graphql(LINK_REPO_MUTATION, {
						projectId,
						repositoryId: repoNodeId,
					});
				},
				catch: (e) =>
					new GraphQLError({
						operation: "linkRepoToProject",
						reason: String(e),
					}),
			}),

		addItemToProject: (projectId, contentId) =>
			Effect.tryPromise({
				try: async () => {
					const octokit = new Octokit({ auth: token });
					await octokit.graphql(ADD_ITEM_MUTATION, {
						projectId,
						contentId,
					});
				},
				catch: (e) =>
					new GraphQLError({
						operation: "addItemToProject",
						reason: String(e),
					}),
			}),
	});
}
