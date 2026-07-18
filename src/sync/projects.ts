import type { GitHubClient, GitHubGraphQLError } from "@savvy-web/github-action-effects";
import { GitHubGraphQL } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { listOpenIssues } from "../github/reads.js";
import type { ProjectInfo } from "../schemas.js";

const RESOLVE_PROJECT_QUERY = `
  query ResolveProject($org: String!, $number: Int!) {
    organization(login: $org) { projectV2(number: $number) { id title number closed } }
  }
`;
const LINK_REPO_MUTATION = `
  mutation LinkRepoToProject($projectId: ID!, $repositoryId: ID!) {
    linkProjectV2ToRepository(input: { projectId: $projectId, repositoryId: $repositoryId }) { repository { id } }
  }
`;
const ADD_ITEM_MUTATION = `
  mutation AddItemToProject($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
  }
`;

interface ResolveProjectResponse {
	readonly organization: {
		readonly projectV2: { id: string; title: string; number: number; closed: boolean } | null;
	};
}

export type ProjectCacheEntry =
	| { readonly ok: true; readonly project: ProjectInfo }
	| { readonly ok: false; readonly error: string };
export type ProjectCache = Map<number, ProjectCacheEntry>;

/** GitHub reports an existing link/item via an "already exists" GraphQL error. */
const isAlreadyExists = (e: GitHubGraphQLError): boolean => {
	const text = `${e.reason} ${e.errors.map((x) => x.message).join(" ")}`.toLowerCase();
	return text.includes("already") || text.includes("exists");
};

export const resolveProjects = (
	org: string,
	projectNumbers: ReadonlyArray<number>,
): Effect.Effect<ProjectCache, never, GitHubGraphQL> =>
	Effect.gen(function* () {
		const gql = yield* GitHubGraphQL;
		const cache: ProjectCache = new Map();
		for (const num of [...new Set(projectNumbers)]) {
			const entry = yield* gql
				.query<ResolveProjectResponse>("resolveProject", RESOLVE_PROJECT_QUERY, { org, number: num })
				.pipe(
					Effect.map((data): ProjectCacheEntry => {
						const p = data.organization.projectV2;
						if (!p) return { ok: false, error: `Project #${num} not found in org "${org}"` };
						if (p.closed) return { ok: false, error: `Project "${p.title}" is closed` };
						return { ok: true, project: { id: p.id, title: p.title, number: p.number, closed: p.closed } };
					}),
					Effect.catch((e) => Effect.succeed({ ok: false as const, error: e.reason })),
				);
			cache.set(num, entry);
		}
		return cache;
	});

export const syncProject = (
	owner: string,
	repo: string,
	repoNodeId: string,
	projectNumber: number,
	cache: ProjectCache,
	dryRun: boolean,
	skipBackfill: boolean,
): Effect.Effect<
	{
		projectTitle: string | null;
		linkStatus: "linked" | "already" | "dry-run" | "error" | "skipped";
		itemsAdded: number;
		itemsAlreadyPresent: number;
	},
	never,
	GitHubGraphQL | GitHubClient
> =>
	Effect.gen(function* () {
		const entry = cache.get(projectNumber);
		if (!entry?.ok)
			return { projectTitle: null, linkStatus: "skipped" as const, itemsAdded: 0, itemsAlreadyPresent: 0 };

		const gql = yield* GitHubGraphQL;
		const { project } = entry;

		// A missing repository node ID would otherwise surface as a cryptic
		// "Could not resolve to a node" GraphQL error — fail with a clear message.
		if (repoNodeId === "") {
			yield* Effect.logWarning(`Skipping project link for ${owner}/${repo}: missing repository node ID`);
			return { projectTitle: project.title, linkStatus: "error" as const, itemsAdded: 0, itemsAlreadyPresent: 0 };
		}

		let linkStatus: "linked" | "already" | "dry-run" | "error";
		if (dryRun) linkStatus = "dry-run";
		else
			linkStatus = yield* gql
				.mutation("linkRepoToProject", LINK_REPO_MUTATION, { projectId: project.id, repositoryId: repoNodeId })
				.pipe(
					Effect.as("linked" as const),
					Effect.catch((e) => Effect.succeed(isAlreadyExists(e) ? ("already" as const) : ("error" as const))),
				);

		let itemsAdded = 0;
		let itemsAlreadyPresent = 0;
		if (!skipBackfill && linkStatus !== "error") {
			const issues = yield* listOpenIssues(owner, repo).pipe(Effect.catch(() => Effect.succeed([])));
			for (const item of issues) {
				if (dryRun) {
					itemsAdded++;
					continue;
				}
				const outcome = yield* gql
					.mutation("addItemToProject", ADD_ITEM_MUTATION, { projectId: project.id, contentId: item.node_id })
					.pipe(
						Effect.as("added" as const),
						Effect.catch((e) => Effect.succeed(isAlreadyExists(e) ? ("exists" as const) : ("error" as const))),
					);
				if (outcome === "added") itemsAdded++;
				else if (outcome === "exists") itemsAlreadyPresent++;
			}
		}

		return { projectTitle: project.title, linkStatus, itemsAdded, itemsAlreadyPresent };
	});
