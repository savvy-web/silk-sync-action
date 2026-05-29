import type { GitHubClient, GitHubClientError } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import type { GitHubLabel } from "../github/reads.js";
import { createLabel, deleteLabel, listLabels, updateLabel } from "../github/reads.js";
import type { LabelDefinition, LabelResult, SyncErrorRecord } from "../schemas.js";

export const syncLabels = (
	owner: string,
	repo: string,
	desiredLabels: ReadonlyArray<LabelDefinition>,
	dryRun: boolean,
	removeCustom: boolean,
): Effect.Effect<
	{ results: ReadonlyArray<LabelResult>; customLabels: ReadonlyArray<string>; errors: ReadonlyArray<SyncErrorRecord> },
	never,
	GitHubClient
> =>
	Effect.gen(function* () {
		const existing = yield* listLabels(owner, repo).pipe(
			Effect.catchAll((e) =>
				Effect.logWarning(`Could not list labels for ${owner}/${repo}: ${e.reason}`).pipe(
					Effect.as([] as ReadonlyArray<GitHubLabel>),
				),
			),
		);

		const results: Array<LabelResult> = [];
		const errors: Array<SyncErrorRecord> = [];
		const desiredNames = new Set(desiredLabels.map((l) => l.name.toLowerCase()));
		const customLabels = existing.filter((l) => !desiredNames.has(l.name.toLowerCase())).map((l) => l.name);

		/** Run a label mutation; on failure record an error and report it did not apply. */
		const apply = (operation: string, name: string, effect: Effect.Effect<void, GitHubClientError, GitHubClient>) =>
			effect.pipe(
				Effect.as(true),
				Effect.catchAll((e) => {
					errors.push({ target: name, operation, error: e.reason });
					return Effect.logWarning(`Failed to ${operation} label "${name}": ${e.reason}`).pipe(Effect.as(false));
				}),
			);

		for (const want of desiredLabels) {
			const have = existing.find((l) => l.name.toLowerCase() === want.name.toLowerCase());
			if (!have) {
				if (dryRun) {
					results.push({ name: want.name, operation: "created" });
				} else if (yield* apply("create", want.name, createLabel(owner, repo, want))) {
					results.push({ name: want.name, operation: "created" });
				}
				continue;
			}
			const colorDiffers = have.color.toLowerCase() !== want.color.toLowerCase();
			const descriptionDiffers = (have.description ?? "") !== want.description;
			const casingDiffers = have.name !== want.name;
			if (colorDiffers || descriptionDiffers || casingDiffers) {
				const changes: Array<string> = [];
				if (casingDiffers) changes.push(`name: "${have.name}" -> "${want.name}"`);
				if (descriptionDiffers) changes.push("description");
				if (colorDiffers) changes.push(`color: #${have.color} -> #${want.color}`);
				if (dryRun) {
					results.push({ name: want.name, operation: "updated", changes });
				} else if (yield* apply("update", want.name, updateLabel(owner, repo, have.name, want))) {
					results.push({ name: want.name, operation: "updated", changes });
				}
			} else {
				results.push({ name: want.name, operation: "unchanged" });
			}
		}

		if (removeCustom) {
			for (const name of customLabels) {
				if (dryRun) {
					results.push({ name, operation: "removed" });
				} else if (yield* apply("remove", name, deleteLabel(owner, repo, name))) {
					results.push({ name, operation: "removed" });
				}
			}
		}

		return { results, customLabels, errors };
	});
