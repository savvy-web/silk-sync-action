/**
 * Repository settings sync logic.
 *
 * @remarks
 * Fetches current repo settings, diffs against desired config, and
 * PATCHes only changed keys. Handles org-enforced 422 rejections
 * gracefully by logging them as warnings rather than errors.
 *
 * @module sync/settings
 */

import { info } from "@actions/core";
import { Effect } from "effect";
import { logDebug } from "../logging.js";
import type { RepositorySettings, SettingChange } from "../schemas/index.js";
import type { GitHubRepo } from "../services/types.js";
import { GitHubRestClient } from "../services/types.js";

/** Settings keys that can be synced via the GitHub REST API. */
const SYNCABLE_KEYS: ReadonlyArray<keyof RepositorySettings> = [
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
 * Sync repository settings by diffing current state against desired config.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param desiredSettings - Settings to enforce from the config file
 * @param currentRepo - Current repository data from the API
 * @param dryRun - When true, changes are logged but not applied
 * @returns The list of setting changes and whether settings were applied
 *
 * @internal
 */
export function syncSettings(
	owner: string,
	repo: string,
	desiredSettings: RepositorySettings,
	currentRepo: GitHubRepo,
	dryRun: boolean,
): Effect.Effect<{ changes: ReadonlyArray<SettingChange>; applied: boolean }, never, GitHubRestClient> {
	return Effect.gen(function* () {
		const rest = yield* GitHubRestClient;

		const changes: SettingChange[] = [];
		const settingsToApply: Record<string, unknown> = {};

		for (const key of SYNCABLE_KEYS) {
			const desired = desiredSettings[key];
			if (desired === undefined) continue;

			const current = currentRepo[key as keyof GitHubRepo];
			if (current !== desired) {
				changes.push({ key, from: current as unknown, to: desired as unknown });
				settingsToApply[key] = desired;
			}
		}

		if (changes.length === 0) {
			yield* logDebug(`${repo}: all settings match`);
			return { changes: [], applied: true };
		}

		for (const change of changes) {
			const prefix = dryRun ? "[DRY-RUN] Would change" : "Changed";
			info(`  ${prefix}: ${change.key}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`);
		}

		if (dryRun) {
			return { changes, applied: false };
		}

		const result = yield* rest.updateRepo(owner, repo, settingsToApply).pipe(
			Effect.map(() => true),
			Effect.catchAll((e) => {
				if (e.isValidationFailed) {
					info(`  Warning: some settings rejected by org policy (422): ${e.reason}`);
				} else {
					info(`  Failed to apply settings: ${e.message}`);
				}
				return Effect.succeed(false);
			}),
		);

		if (result) {
			info("  Settings applied successfully");
		}

		return { changes, applied: result };
	});
}
