/**
 * Unified repository discovery.
 *
 * @remarks
 * Combines org custom property discovery and explicit repo list,
 * deduplicates by full name (union semantics), and fails if no
 * repos are discovered. When both discovery modes return the same
 * repo, custom properties from org discovery are preserved.
 *
 * @module discovery
 */

import { info } from "@actions/core";
import { Effect } from "effect";
import { logDebug } from "../logging.js";
import { DiscoveryError } from "../schemas/errors.js";
import type { ActionInputs, DiscoveredRepo } from "../schemas/index.js";
import type { GitHubRestClient } from "../services/types.js";
import { discoverByCustomProperties } from "./org.js";
import { discoverByExplicitList } from "./personal.js";

/**
 * Discover repos using all configured methods and merge results.
 *
 * @remarks
 * Both discovery modes can be used simultaneously. Results are merged
 * as a union and deduplicated by full repository name (case-insensitive).
 * When duplicates exist, custom properties from org discovery take precedence.
 *
 * @param org - The GitHub organization name
 * @param inputs - Parsed action inputs containing discovery configuration
 * @returns Effect yielding discovered repos, or failing with {@link DiscoveryError}
 *
 * @internal
 */
export function discoverRepos(
	org: string,
	inputs: ActionInputs,
): Effect.Effect<ReadonlyArray<DiscoveredRepo>, DiscoveryError, GitHubRestClient> {
	return Effect.gen(function* () {
		const orgRepos =
			inputs.customProperties.length > 0 ? yield* discoverByCustomProperties(org, inputs.customProperties) : [];

		const explicitRepos = inputs.repos.length > 0 ? yield* discoverByExplicitList(org, inputs.repos) : [];

		// Merge and deduplicate by fullName (union semantics)
		const repoMap = new Map<string, DiscoveredRepo>();

		for (const repo of orgRepos) {
			repoMap.set(repo.fullName.toLowerCase(), repo);
		}

		for (const repo of explicitRepos) {
			const key = repo.fullName.toLowerCase();
			if (!repoMap.has(key)) {
				repoMap.set(key, repo);
			} else {
				// Merge: org discovery has custom properties, keep those
				const existing = repoMap.get(key);
				repoMap.set(key, {
					...repo,
					customProperties: {
						...repo.customProperties,
						...(existing?.customProperties ?? {}),
					},
				});
			}
		}

		const allRepos = Array.from(repoMap.values());

		if (allRepos.length === 0) {
			return yield* Effect.fail(
				new DiscoveryError({
					reason: "No repositories discovered. Check your 'custom-properties' and/or 'repos' inputs.",
				}),
			);
		}

		info(`Discovered ${allRepos.length} repositories:`);
		if (orgRepos.length > 0) {
			info(`  Custom properties: ${orgRepos.length} repos matched`);
		}
		if (explicitRepos.length > 0) {
			info(`  Explicit list: ${explicitRepos.length} repos specified`);
		}
		for (const repo of allRepos) {
			info(`  - ${repo.fullName}`);
		}

		yield* logDebug(`Deduplicated from ${orgRepos.length + explicitRepos.length} to ${allRepos.length} repos`);

		return allRepos;
	});
}
