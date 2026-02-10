/**
 * Label sync logic.
 *
 * @remarks
 * Compares existing labels against desired config and creates, updates,
 * or removes labels as needed. Uses case-insensitive name matching.
 * Each label operation is individually error-handled so a single
 * failure does not halt the remaining labels.
 *
 * @module sync/labels
 */

import { info } from "@actions/core";
import { Effect } from "effect";
import { logDebug } from "../logging.js";
import { LabelSyncError } from "../schemas/errors.js";
import type { LabelDefinition, LabelResult } from "../schemas/index.js";
import type { GitHubLabel } from "../services/types.js";
import { GitHubRestClient } from "../services/types.js";

/**
 * Sync labels for a single repository.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param desiredLabels - Label definitions from the config file
 * @param dryRun - When true, changes are logged but not applied
 * @param removeCustom - When true, labels not in config are removed
 * @returns Per-label results and a list of custom (non-standard) labels
 *
 * @internal
 */
export function syncLabels(
	owner: string,
	repo: string,
	desiredLabels: ReadonlyArray<LabelDefinition>,
	dryRun: boolean,
	removeCustom: boolean,
): Effect.Effect<
	{ results: ReadonlyArray<LabelResult>; customLabels: ReadonlyArray<string> },
	never,
	GitHubRestClient
> {
	return Effect.gen(function* () {
		const rest = yield* GitHubRestClient;

		const existingLabels = yield* rest.listLabels(owner, repo).pipe(
			Effect.catchAll((e) => {
				info(`  Warning: could not list labels for ${owner}/${repo}: ${e.message}`);
				return Effect.succeed([] as ReadonlyArray<GitHubLabel>);
			}),
		);

		yield* logDebug(`${repo}: ${existingLabels.length} existing labels`);

		const results: LabelResult[] = [];
		const desiredNameSet = new Set(desiredLabels.map((l) => l.name.toLowerCase()));

		const customLabels = existingLabels.filter((l) => !desiredNameSet.has(l.name.toLowerCase())).map((l) => l.name);

		for (const desired of desiredLabels) {
			const existing = existingLabels.find((l) => l.name.toLowerCase() === desired.name.toLowerCase());

			if (!existing) {
				const result = yield* createLabel(rest, owner, repo, desired, dryRun);
				results.push(result);
			} else {
				const colorDiffers = existing.color.toLowerCase() !== desired.color.toLowerCase();
				const descriptionDiffers = (existing.description ?? "") !== desired.description;
				const casingDiffers = existing.name !== desired.name;

				if (colorDiffers || descriptionDiffers || casingDiffers) {
					const changes: string[] = [];
					if (casingDiffers) changes.push(`name: "${existing.name}" -> "${desired.name}"`);
					if (descriptionDiffers) changes.push("description");
					if (colorDiffers) changes.push(`color: #${existing.color} -> #${desired.color}`);

					const result = yield* updateLabel(rest, owner, repo, existing.name, desired, changes, dryRun);
					results.push(result);
				} else {
					results.push({ name: desired.name, operation: "unchanged" });
				}
			}
		}

		if (removeCustom && customLabels.length > 0) {
			for (const labelName of customLabels) {
				const result = yield* removeLabel(rest, owner, repo, labelName, dryRun);
				results.push(result);
			}
		}

		return { results, customLabels };
	});
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createLabel(
	rest: GitHubRestClient["Type"],
	owner: string,
	repo: string,
	label: LabelDefinition,
	dryRun: boolean,
): Effect.Effect<LabelResult> {
	return Effect.gen(function* () {
		if (dryRun) {
			info(`  [DRY-RUN] Would create: ${label.name}`);
			return { name: label.name, operation: "created" as const };
		}

		yield* rest.createLabel(owner, repo, label).pipe(
			Effect.catchAll((e) =>
				Effect.fail(
					new LabelSyncError({
						label: label.name,
						operation: "create",
						reason: e.reason,
					}),
				),
			),
			Effect.catchAll((e) => {
				info(`  Failed to create "${label.name}": ${e.message}`);
				return Effect.succeed(undefined);
			}),
		);

		info(`  Created: ${label.name}`);
		return { name: label.name, operation: "created" as const };
	});
}

function updateLabel(
	rest: GitHubRestClient["Type"],
	owner: string,
	repo: string,
	currentName: string,
	label: LabelDefinition,
	changes: string[],
	dryRun: boolean,
): Effect.Effect<LabelResult> {
	return Effect.gen(function* () {
		if (dryRun) {
			info(`  [DRY-RUN] Would update: ${label.name} (${changes.join(", ")})`);
			return { name: label.name, operation: "updated" as const, changes };
		}

		yield* rest.updateLabel(owner, repo, currentName, label).pipe(
			Effect.catchAll((e) =>
				Effect.fail(
					new LabelSyncError({
						label: label.name,
						operation: "update",
						reason: e.reason,
					}),
				),
			),
			Effect.catchAll((e) => {
				info(`  Failed to update "${label.name}": ${e.message}`);
				return Effect.succeed(undefined);
			}),
		);

		info(`  Updated: ${label.name} (${changes.join(", ")})`);
		return { name: label.name, operation: "updated" as const, changes };
	});
}

function removeLabel(
	rest: GitHubRestClient["Type"],
	owner: string,
	repo: string,
	labelName: string,
	dryRun: boolean,
): Effect.Effect<LabelResult> {
	return Effect.gen(function* () {
		if (dryRun) {
			info(`  [DRY-RUN] Would remove: ${labelName}`);
			return { name: labelName, operation: "removed" as const };
		}

		yield* rest.deleteLabel(owner, repo, labelName).pipe(
			Effect.catchAll((e) =>
				Effect.fail(
					new LabelSyncError({
						label: labelName,
						operation: "remove",
						reason: e.reason,
					}),
				),
			),
			Effect.catchAll((e) => {
				info(`  Failed to remove "${labelName}": ${e.message}`);
				return Effect.succeed(undefined);
			}),
		);

		info(`  Removed: ${labelName}`);
		return { name: labelName, operation: "removed" as const };
	});
}
