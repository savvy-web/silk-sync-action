import type { GitHubClient } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { DiscoveryError } from "../errors.js";
import { getRepo } from "../github/reads.js";
import type { DiscoveredRepo } from "../schemas.js";

export const discoverByExplicitList = (
	defaultOwner: string,
	repoNames: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<DiscoveredRepo>, DiscoveryError, GitHubClient> =>
	Effect.gen(function* () {
		if (repoNames.length === 0) return [];

		const discovered: Array<DiscoveredRepo> = [];
		const errors: Array<string> = [];

		for (const raw of repoNames) {
			const [owner, repo] = raw.includes("/") ? (raw.split("/", 2) as [string, string]) : [defaultOwner, raw];
			const result = yield* getRepo(owner, repo).pipe(
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
					errors.push(`${owner}/${repo} (${e.reason})`);
					return Effect.succeed(null);
				}),
			);
			if (result) discovered.push(result);
		}

		if (discovered.length === 0 && errors.length > 0) {
			return yield* Effect.fail(
				new DiscoveryError({ reason: `None of the specified repos could be validated: ${errors.join(", ")}` }),
			);
		}

		yield* Effect.logDebug(`Validated ${discovered.length} explicit repos`);
		return discovered;
	});
