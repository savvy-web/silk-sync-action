import type { GitHubClient } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import type { GitHubRepo } from "../github/reads.js";
import { updateRepo } from "../github/reads.js";
import type { RepositorySettings, SettingChange } from "../schemas.js";

const SYNCABLE_KEYS: ReadonlyArray<keyof RepositorySettings & keyof GitHubRepo> = [
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

export const syncSettings = (
	owner: string,
	repo: string,
	desired: RepositorySettings,
	current: GitHubRepo,
	dryRun: boolean,
): Effect.Effect<{ changes: ReadonlyArray<SettingChange>; applied: boolean }, never, GitHubClient> =>
	Effect.gen(function* () {
		const changes: Array<SettingChange> = [];
		const toApply: Record<string, unknown> = {};
		for (const key of SYNCABLE_KEYS) {
			const want = desired[key];
			if (want === undefined) continue;
			const have = current[key];
			if (have !== want) {
				changes.push({ key, from: have, to: want });
				toApply[key] = want;
			}
		}

		if (changes.length === 0) return { changes: [], applied: true };
		if (dryRun) return { changes, applied: false };

		const applied = yield* updateRepo(owner, repo, toApply).pipe(
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
