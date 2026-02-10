/**
 * Project sync logic.
 *
 * @remarks
 * Resolves GitHub Projects V2, links repos, and backfills open
 * issues/PRs into projects. Uses an in-memory cache to avoid
 * redundant GraphQL calls for the same project.
 *
 * @module sync/projects
 */

import { info } from "@actions/core";
import { Effect } from "effect";
import { logDebug } from "../logging.js";
import { GRAPHQL_CHECK_INTERVAL, INTER_ITEM_DELAY_MS, checkGraphQLRateLimit, delay } from "../rate-limit/throttle.js";
import type { ProjectInfo } from "../schemas/index.js";
import { GitHubGraphQLClient, GitHubRestClient } from "../services/types.js";

/**
 * Cached project resolution result.
 *
 * @internal
 */
type ProjectCacheEntry =
	| { readonly ok: true; readonly project: ProjectInfo }
	| { readonly ok: false; readonly error: string };

/**
 * In-memory project cache keyed by project number.
 *
 * @internal
 */
export type ProjectCache = Map<number, ProjectCacheEntry>;

/**
 * Resolve all unique projects referenced by repos and build a cache.
 *
 * @param org - The GitHub organization name
 * @param projectNumbers - Project numbers to resolve
 * @returns Effect yielding a populated project cache
 *
 * @internal
 */
export function resolveProjects(
	org: string,
	projectNumbers: ReadonlyArray<number>,
): Effect.Effect<ProjectCache, never, GitHubGraphQLClient> {
	return Effect.gen(function* () {
		const graphql = yield* GitHubGraphQLClient;
		const cache: ProjectCache = new Map();

		const unique = [...new Set(projectNumbers)];

		if (unique.length === 0) {
			return cache;
		}

		info(`Resolving ${unique.length} project(s)...`);

		for (const num of unique) {
			const result = yield* graphql.resolveProject(org, num).pipe(
				Effect.map((project) => {
					if (project.closed) {
						info(`  Project "${project.title}" (#${num}) is closed, skipping`);
						return { ok: false as const, error: `Project "${project.title}" is closed` };
					}
					info(`  Resolved: "${project.title}" (#${num})`);
					return { ok: true as const, project };
				}),
				Effect.catchAll((e) => {
					info(`  Failed to resolve project #${num}: ${e.reason}`);
					return Effect.succeed({ ok: false as const, error: e.reason });
				}),
			);

			cache.set(num, result);
		}

		return cache;
	});
}

/**
 * Link a repository to a project and optionally backfill items.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param repoNodeId - GraphQL node ID of the repository
 * @param projectNumber - The project number to sync with
 * @param projectCache - Pre-resolved project cache
 * @param dryRun - When true, changes are logged but not applied
 * @param skipBackfill - When true, only links repos without backfilling items
 * @returns Link status and backfill counts
 *
 * @internal
 */
export function syncProject(
	owner: string,
	repo: string,
	repoNodeId: string,
	projectNumber: number,
	projectCache: ProjectCache,
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
	GitHubGraphQLClient | GitHubRestClient
> {
	return Effect.gen(function* () {
		const entry = projectCache.get(projectNumber);

		if (!entry || !entry.ok) {
			const reason = entry ? entry.error : "Project not resolved";
			info(`  Skipping project sync: ${reason}`);
			return { projectTitle: null, linkStatus: "skipped" as const, itemsAdded: 0, itemsAlreadyPresent: 0 };
		}

		const { project } = entry;
		const graphql = yield* GitHubGraphQLClient;

		const linkStatus = yield* linkRepo(graphql, project, repoNodeId, dryRun);

		let itemsAdded = 0;
		let itemsAlreadyPresent = 0;

		if (!skipBackfill && linkStatus !== "error") {
			const backfill = yield* backfillItems(owner, repo, project, dryRun);
			itemsAdded = backfill.added;
			itemsAlreadyPresent = backfill.alreadyPresent;
		} else if (skipBackfill) {
			yield* logDebug(`${repo}: backfill skipped (skip-backfill=true)`);
		}

		return { projectTitle: project.title, linkStatus, itemsAdded, itemsAlreadyPresent };
	});
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function linkRepo(
	graphql: GitHubGraphQLClient["Type"],
	project: ProjectInfo,
	repoNodeId: string,
	dryRun: boolean,
): Effect.Effect<"linked" | "already" | "dry-run" | "error"> {
	return Effect.gen(function* () {
		if (dryRun) {
			info(`  [DRY-RUN] Would link to "${project.title}"`);
			return "dry-run" as const;
		}

		const result = yield* graphql.linkRepoToProject(project.id, repoNodeId).pipe(
			Effect.map(() => "linked" as const),
			Effect.catchAll((e) => {
				if (e.isAlreadyExists) {
					info(`  Already linked to "${project.title}"`);
					return Effect.succeed("already" as const);
				}
				info(`  Failed to link: ${e.reason}`);
				return Effect.succeed("error" as const);
			}),
		);

		if (result === "linked") {
			info(`  Linked to "${project.title}"`);
		}

		return result;
	});
}

function backfillItems(
	owner: string,
	repo: string,
	project: ProjectInfo,
	dryRun: boolean,
): Effect.Effect<{ added: number; alreadyPresent: number }, never, GitHubGraphQLClient | GitHubRestClient> {
	return Effect.gen(function* () {
		const rest = yield* GitHubRestClient;
		const graphql = yield* GitHubGraphQLClient;

		let added = 0;
		let alreadyPresent = 0;
		let page = 1;
		let pageCount = 0;

		yield* logDebug(`${repo}: backfilling open issues/PRs into "${project.title}"...`);

		while (true) {
			if (pageCount > 0 && pageCount % GRAPHQL_CHECK_INTERVAL === 0) {
				yield* checkGraphQLRateLimit();
			}

			const items = yield* rest
				.listOpenIssues(owner, repo, page)
				.pipe(Effect.catchAll(() => Effect.succeed([] as const)));

			if (items.length === 0) break;

			for (const item of items) {
				if (dryRun) {
					added++;
					continue;
				}

				const result = yield* graphql.addItemToProject(project.id, item.node_id).pipe(
					Effect.map(() => "added" as const),
					Effect.catchAll((e) => {
						if (e.isAlreadyExists) {
							return Effect.succeed("exists" as const);
						}
						return Effect.succeed("error" as const);
					}),
				);

				if (result === "added") {
					added++;
				} else if (result === "exists") {
					alreadyPresent++;
				}

				yield* delay(INTER_ITEM_DELAY_MS);
			}

			pageCount++;
			if (items.length < 100) break;
			page++;
		}

		const total = added + alreadyPresent;
		if (dryRun) {
			info(`  [DRY-RUN] Backfill: ${added} items would be added (${total} total open)`);
		} else {
			info(`  Backfill: ${added} added, ${alreadyPresent} already present (${total} total)`);
		}

		return { added, alreadyPresent };
	});
}
