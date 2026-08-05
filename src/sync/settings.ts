import type { GitHubRepository, Repo, RepositoryPatch } from "@effected/github";
import { Effect } from "effect";
import type { RepoSnapshot } from "../github/reads.js";
import { updateRepo } from "../github/reads.js";
import type { RepositorySettings, SettingChange } from "../schemas.js";

const SYNCABLE_KEYS: ReadonlyArray<keyof RepositorySettings & keyof RepoSnapshot> = [
	"has_wiki",
	"has_issues",
	"has_projects",
	"has_discussions",
	"allow_merge_commit",
	"allow_squash_merge",
	"squash_merge_commit_title",
	"squash_merge_commit_message",
	"allow_rebase_merge",
	"allow_update_branch",
	"delete_branch_on_merge",
	"web_commit_signoff_required",
	"allow_auto_merge",
];

/**
 * Compare the repository's live settings against config and reconcile the drift.
 *
 * @remarks
 * The repository is the ambient `Repo`; only the drift is applied, so a key the
 * config does not mention is never written.
 */
export const syncSettings = (
	desired: RepositorySettings,
	current: RepoSnapshot,
	dryRun: boolean,
): Effect.Effect<{ changes: ReadonlyArray<SettingChange>; applied: boolean }, never, GitHubRepository | Repo> =>
	Effect.gen(function* () {
		const changes: Array<SettingChange> = [];
		const toApply: RepositoryPatch = {};
		for (const key of SYNCABLE_KEYS) {
			const want = desired[key];
			if (want === undefined) continue;
			const have = current[key];
			if (have !== want) {
				changes.push({ key, from: have, to: want });
				// `key` is a union, so a direct `toApply[key] = want` cannot be
				// correlated by the checker. This writes the same thing without a cast.
				Object.assign(toApply, { [key]: want });
			}
		}

		if (changes.length === 0) return { changes: [], applied: true };
		if (dryRun) return { changes, applied: false };

		const applied = yield* updateRepo(toApply).pipe(
			Effect.as(true),
			Effect.catch((e) => {
				const msg =
					e.status === 422
						? `some settings rejected by org policy (422): ${e.reason}`
						: `failed to apply settings: ${e.reason}`;
				return Effect.logWarning(`  ${msg}`).pipe(Effect.as(false));
			}),
		);
		return { changes, applied };
	});
