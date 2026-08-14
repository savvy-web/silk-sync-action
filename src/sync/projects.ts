import type { GitHubIssue, Repo } from "@effected/github";
import { GitHubClient, GraphQLDocument } from "@effected/github";
import { Effect, Schema } from "effect";
import { listOpenIssues } from "../github/reads.js";
import type { ProjectInfo, SyncErrorRecord } from "../schemas.js";

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

/**
 * Link one repository to its tracked project and backfill open issues.
 *
 * @remarks
 * Every failure — an unresolved project, a missing node ID, a rejected link,
 * a failed issue listing or item add — is returned as a
 * {@link SyncErrorRecord} so the caller can fold it into the repository's
 * failure determination. "Already linked" / "already present" are not
 * failures; a dry run performs no writes and records no errors.
 */
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
		errors: ReadonlyArray<SyncErrorRecord>;
	},
	never,
	GitHubClient | GitHubIssue | Repo
> =>
	Effect.gen(function* () {
		const errors: Array<SyncErrorRecord> = [];

		const entry = cache.get(projectNumber);
		if (!entry?.ok) {
			// The resolution failure was cached once for the run; surfacing it per
			// repository is what keeps a repo tracking a missing or closed project
			// from reporting success.
			errors.push({
				target: "project",
				operation: "resolve",
				error: entry ? entry.error : `Project #${projectNumber} was not resolved`,
			});
			return { projectTitle: null, linkStatus: "skipped" as const, itemsAdded: 0, itemsAlreadyPresent: 0, errors };
		}

		const client = yield* GitHubClient;
		const { project } = entry;

		// A missing repository node ID would otherwise surface as a cryptic
		// "Could not resolve to a node" GraphQL error — fail with a clear message.
		if (repoNodeId === "") {
			yield* Effect.logWarning(`Skipping project link for ${owner}/${repo}: missing repository node ID`);
			errors.push({ target: "project", operation: "link", error: "missing repository node ID" });
			return {
				projectTitle: project.title,
				linkStatus: "error" as const,
				itemsAdded: 0,
				itemsAlreadyPresent: 0,
				errors,
			};
		}

		let linkStatus: "linked" | "already" | "dry-run" | "error";
		if (dryRun) linkStatus = "dry-run";
		else
			linkStatus = yield* client.graphql(LinkRepoToProject, { projectId: project.id, repositoryId: repoNodeId }).pipe(
				Effect.as("linked" as const),
				// The kit classifies "already linked" once, structurally. The
				// pre-port code lowercased the message and grepped it for
				// "already"/"exists" — exactly the defect `kind` exists to delete.
				Effect.catch((e) => {
					if (e.kind === "alreadyExists") return Effect.succeed("already" as const);
					errors.push({ target: "project", operation: "link", error: e.reason });
					return Effect.succeed("error" as const);
				}),
			);

		let itemsAdded = 0;
		let itemsAlreadyPresent = 0;
		if (!skipBackfill && linkStatus !== "error") {
			const issues = yield* listOpenIssues.pipe(
				Effect.catch((e) => {
					errors.push({ target: "project", operation: "list-issues", error: e.reason });
					return Effect.succeed([]);
				}),
			);
			for (const item of issues) {
				if (dryRun) {
					itemsAdded++;
					continue;
				}
				const outcome = yield* client.graphql(AddItemToProject, { projectId: project.id, contentId: item.nodeId }).pipe(
					Effect.as("added" as const),
					Effect.catch((e) => {
						if (e.kind === "alreadyExists") return Effect.succeed("exists" as const);
						errors.push({ target: "project", operation: "add-item", error: e.reason });
						return Effect.succeed("error" as const);
					}),
				);
				if (outcome === "added") itemsAdded++;
				else if (outcome === "exists") itemsAlreadyPresent++;
			}
		}

		return { projectTitle: project.title, linkStatus, itemsAdded, itemsAlreadyPresent, errors };
	});
