/**
 * Organization-based repository discovery via custom properties.
 *
 * @remarks
 * Queries the GitHub REST API for all repos in the org, then filters
 * by user-specified custom property key=value pairs using AND logic
 * (repo must match ALL specified properties). Property values are
 * compared case-insensitively.
 *
 * @module discovery/org
 */

import { Effect } from "effect";
import { logDebug, logDebugState } from "../logging.js";
import { DiscoveryError } from "../schemas/errors.js";
import type { CustomProperty, DiscoveredRepo } from "../schemas/index.js";
import { GitHubRestClient } from "../services/types.js";

/**
 * Discover repositories by matching org custom properties.
 *
 * @remarks
 * All specified properties must match (AND logic). Property values
 * are compared case-insensitively.
 *
 * @param org - The GitHub organization name
 * @param properties - Custom property filters to match against
 * @returns Effect yielding matched repos, or failing with {@link DiscoveryError}
 *
 * @internal
 */
export function discoverByCustomProperties(
	org: string,
	properties: ReadonlyArray<CustomProperty>,
): Effect.Effect<ReadonlyArray<DiscoveredRepo>, DiscoveryError, GitHubRestClient> {
	return Effect.gen(function* () {
		if (properties.length === 0) {
			return [];
		}

		const rest = yield* GitHubRestClient;

		yield* logDebug(`Querying custom properties for org "${org}"...`);
		yield* logDebugState("Filter properties", properties);

		const allRepos = yield* rest.getOrgRepoProperties(org).pipe(
			Effect.mapError(
				(e) =>
					new DiscoveryError({
						reason: `Failed to query org custom properties: ${e.message}`,
					}),
			),
		);

		yield* logDebug(`Found ${allRepos.length} repos with custom properties in org "${org}"`);

		const matched = allRepos.filter((repo) => {
			const repoProps = new Map(
				repo.properties.map((p) => [p.property_name.toLowerCase(), p.value?.toLowerCase() ?? ""]),
			);

			return properties.every((filter) => {
				const actual = repoProps.get(filter.key.toLowerCase());
				return actual === filter.value.toLowerCase();
			});
		});

		yield* logDebug(`${matched.length} repos match all custom property filters`);

		const discovered: DiscoveredRepo[] = matched.map((repo) => {
			const propsMap: Record<string, string> = {};
			for (const p of repo.properties) {
				if (p.value != null) {
					propsMap[p.property_name] = p.value;
				}
			}

			return {
				name: repo.repository_name,
				owner: org,
				fullName: repo.repository_full_name,
				nodeId: repo.repository_node_id,
				customProperties: propsMap,
			};
		});

		return discovered;
	});
}
