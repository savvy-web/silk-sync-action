import type { GitHubClient } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { DiscoveryError } from "../errors.js";
import { listOrgRepoProperties } from "../github/reads.js";
import type { CustomProperty, DiscoveredRepo } from "../schemas.js";

export const discoverByCustomProperties = (
	org: string,
	properties: ReadonlyArray<CustomProperty>,
): Effect.Effect<ReadonlyArray<DiscoveredRepo>, DiscoveryError, GitHubClient> =>
	Effect.gen(function* () {
		if (properties.length === 0) return [];

		const rows = yield* listOrgRepoProperties(org).pipe(
			Effect.mapError((e) => new DiscoveryError({ reason: `Failed to query org custom properties: ${e.reason}` })),
		);

		const matched = rows.filter((row) => {
			const map = new Map(row.properties.map((p) => [p.property_name.toLowerCase(), (p.value ?? "").toLowerCase()]));
			return properties.every((f) => map.get(f.key.toLowerCase()) === f.value.toLowerCase());
		});

		yield* Effect.logDebug(`${matched.length}/${rows.length} repos match all custom-property filters in "${org}"`);

		return matched.map((row) => {
			const propsMap: Record<string, string> = {};
			for (const p of row.properties) if (p.value != null) propsMap[p.property_name] = p.value;
			return {
				name: row.repository_name,
				owner: org,
				fullName: row.repository_full_name,
				nodeId: row.repository_node_id,
				customProperties: propsMap,
			} satisfies DiscoveredRepo;
		});
	});
