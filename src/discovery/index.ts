import type { GitHubClient } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { DiscoveryError } from "../errors.js";
import type { CustomProperty, DiscoveredRepo } from "../schemas.js";
import { discoverByCustomProperties } from "./customProperties.js";
import { discoverByExplicitList } from "./explicit.js";

export const discoverRepos = (
	org: string,
	opts: { readonly customProperties: ReadonlyArray<CustomProperty>; readonly repos: ReadonlyArray<string> },
): Effect.Effect<ReadonlyArray<DiscoveredRepo>, DiscoveryError, GitHubClient> =>
	Effect.gen(function* () {
		const orgRepos =
			opts.customProperties.length > 0 ? yield* discoverByCustomProperties(org, opts.customProperties) : [];
		const explicitRepos = opts.repos.length > 0 ? yield* discoverByExplicitList(org, opts.repos) : [];

		const map = new Map<string, DiscoveredRepo>();
		for (const repo of orgRepos) map.set(repo.fullName.toLowerCase(), repo);
		for (const repo of explicitRepos) {
			const key = repo.fullName.toLowerCase();
			const existing = map.get(key);
			if (!existing) map.set(key, repo);
			else map.set(key, { ...repo, customProperties: { ...repo.customProperties, ...existing.customProperties } });
		}

		const all = [...map.values()];
		if (all.length === 0) {
			return yield* Effect.fail(
				new DiscoveryError({
					reason: "No repositories discovered. Check your 'custom-properties' and/or 'repos' inputs.",
				}),
			);
		}

		yield* Effect.logInfo(`Discovered ${all.length} repositories`);
		for (const r of all) yield* Effect.logDebug(`  - ${r.fullName}`);
		return all;
	});
