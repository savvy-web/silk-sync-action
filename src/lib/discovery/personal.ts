/**
 * Personal/explicit repository discovery.
 *
 * @remarks
 * Validates each explicitly specified repo exists by calling the
 * GitHub REST API, and maps them to {@link DiscoveredRepo} objects.
 * Repos that cannot be validated are logged but do not halt discovery
 * unless every specified repo fails.
 *
 * @module discovery/personal
 */

import { Effect } from "effect";
import { logDebug } from "../logging.js";
import { DiscoveryError } from "../schemas/errors.js";
import type { DiscoveredRepo } from "../schemas/index.js";
import { GitHubRestClient } from "../services/types.js";

/**
 * Discover repositories from an explicit list of repo names.
 *
 * @remarks
 * Each repo name can be:
 * - Just the repo name (e.g. "my-repo") - owner is inferred from the org parameter
 * - Full name with owner (e.g. "owner/my-repo")
 *
 * Each repo is validated via the GitHub API to ensure it exists and
 * to retrieve its `node_id` for project operations.
 *
 * @param defaultOwner - The org name used when a repo name has no owner prefix
 * @param repoNames - List of repo names to validate
 * @returns Effect yielding validated repos, or failing with {@link DiscoveryError}
 *
 * @internal
 */
export function discoverByExplicitList(
	defaultOwner: string,
	repoNames: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<DiscoveredRepo>, DiscoveryError, GitHubRestClient> {
	return Effect.gen(function* () {
		if (repoNames.length === 0) {
			return [];
		}

		const rest = yield* GitHubRestClient;

		yield* logDebug(`Validating ${repoNames.length} explicit repos...`);

		const discovered: DiscoveredRepo[] = [];
		const errors: string[] = [];

		for (const rawName of repoNames) {
			const [owner, repo] = rawName.includes("/") ? rawName.split("/", 2) : [defaultOwner, rawName];

			const result = yield* rest.getRepo(owner, repo).pipe(
				Effect.map(
					(data) =>
						({
							name: data.name,
							owner: data.owner.login,
							fullName: data.full_name,
							nodeId: data.node_id,
							customProperties: {},
						}) satisfies DiscoveredRepo,
				),
				Effect.catchAll((e) => {
					if (e.isNotFound) {
						errors.push(`${owner}/${repo} (not found)`);
					} else {
						errors.push(`${owner}/${repo} (${e.reason})`);
					}
					return Effect.succeed(null);
				}),
			);

			if (result) {
				discovered.push(result);
			}
		}

		if (errors.length > 0) {
			yield* logDebug(`Failed to validate repos: ${errors.join(", ")}`);
		}

		if (discovered.length === 0 && errors.length > 0) {
			return yield* Effect.fail(
				new DiscoveryError({
					reason: `None of the specified repos could be validated: ${errors.join(", ")}`,
				}),
			);
		}

		yield* logDebug(`Validated ${discovered.length} explicit repos`);

		return discovered;
	});
}
