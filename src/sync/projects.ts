import type { GitHubIssue, Repo } from "@effected/github";
import { GitHubClient, GraphQLDocument } from "@effected/github";
import { Effect, Schema } from "effect";
import { listOpenIssues } from "../github/reads.js";
import type { ProjectInfo } from "../schemas.js";

const ResolveProjectResponse = Schema.Struct({
	organization: Schema.Struct({
		projectV2: Schema.NullOr(
			Schema.Struct({
				id: Schema.String,
				title: Schema.String,
				number: Schema.Number,
				closed: Schema.Boolean,
			}),
		),
	}),
});

const ResolveProject = GraphQLDocument.make({
	name: "resolveProject",
	document: `
  query ResolveProject($org: String!, $number: Int!) {
    organization(login: $org) { projectV2(number: $number) { id title number closed } }
  }
`,
	response: ResolveProjectResponse,
})<{ readonly org: string; readonly number: number }>();

const LinkRepoToProject = GraphQLDocument.make({
	name: "linkRepoToProject",
	document: `
  mutation LinkRepoToProject($projectId: ID!, $repositoryId: ID!) {
    linkProjectV2ToRepository(input: { projectId: $projectId, repositoryId: $repositoryId }) { repository { id } }
  }
`,
	response: Schema.Unknown,
})<{ readonly projectId: string; readonly repositoryId: string }>();

const AddItemToProject = GraphQLDocument.make({
	name: "addItemToProject",
	document: `
  mutation AddItemToProject($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
  }
`,
	response: Schema.Unknown,
})<{ readonly projectId: string; readonly contentId: string }>();

export type ProjectCacheEntry =
	| { readonly ok: true; readonly project: ProjectInfo }
	| { readonly ok: false; readonly error: string };
export type ProjectCache = Map<number, ProjectCacheEntry>;

/**
 * Resolve every project number the run will touch, once.
 *
 * @remarks
 * A project that is missing or closed is cached as a failure rather than
 * retried per repository — the answer cannot change within a run.
 */
export const resolveProjects = (
	org: string,
	projectNumbers: ReadonlyArray<number>,
): Effect.Effect<ProjectCache, never, GitHubClient> =>
	Effect.gen(function* () {
		const client = yield* GitHubClient;
		const cache: ProjectCache = new Map();
		for (const num of [...new Set(projectNumbers)]) {
			const entry = yield* client.graphql(ResolveProject, { org, number: num }).pipe(
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
	GitHubClient | GitHubIssue | Repo
> =>
	Effect.gen(function* () {
		const entry = cache.get(projectNumber);
		if (!entry?.ok)
			return { projectTitle: null, linkStatus: "skipped" as const, itemsAdded: 0, itemsAlreadyPresent: 0 };

		const client = yield* GitHubClient;
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
			linkStatus = yield* client.graphql(LinkRepoToProject, { projectId: project.id, repositoryId: repoNodeId }).pipe(
				Effect.as("linked" as const),
				// The kit classifies "already linked" once, structurally. The
				// pre-port code lowercased the message and grepped it for
				// "already"/"exists" — exactly the defect `kind` exists to delete.
				Effect.catch((e) => Effect.succeed(e.kind === "alreadyExists" ? ("already" as const) : ("error" as const))),
			);

		let itemsAdded = 0;
		let itemsAlreadyPresent = 0;
		if (!skipBackfill && linkStatus !== "error") {
			const issues = yield* listOpenIssues.pipe(Effect.catch(() => Effect.succeed([])));
			for (const item of issues) {
				if (dryRun) {
					itemsAdded++;
					continue;
				}
				const outcome = yield* client.graphql(AddItemToProject, { projectId: project.id, contentId: item.nodeId }).pipe(
					Effect.as("added" as const),
					Effect.catch((e) => Effect.succeed(e.kind === "alreadyExists" ? ("exists" as const) : ("error" as const))),
				);
				if (outcome === "added") itemsAdded++;
				else if (outcome === "exists") itemsAlreadyPresent++;
			}
		}

		return { projectTitle: project.title, linkStatus, itemsAdded, itemsAlreadyPresent };
	});
