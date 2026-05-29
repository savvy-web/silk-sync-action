import type { GitHubClient } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import type { GitHubLabel } from "../github/reads.js";
import { createLabel, deleteLabel, listLabels, updateLabel } from "../github/reads.js";
import type { LabelDefinition, LabelResult } from "../schemas.js";

export const syncLabels = (
	owner: string,
	repo: string,
	desiredLabels: ReadonlyArray<LabelDefinition>,
	dryRun: boolean,
	removeCustom: boolean,
): Effect.Effect<{ results: ReadonlyArray<LabelResult>; customLabels: ReadonlyArray<string> }, never, GitHubClient> =>
	Effect.gen(function* () {
		const existing = yield* listLabels(owner, repo).pipe(
			Effect.catchAll((e) =>
				Effect.logWarning(`Could not list labels for ${owner}/${repo}: ${e.reason}`).pipe(
					Effect.as([] as ReadonlyArray<GitHubLabel>),
				),
			),
		);

		const results: Array<LabelResult> = [];
		const desiredNames = new Set(desiredLabels.map((l) => l.name.toLowerCase()));
		const customLabels = existing.filter((l) => !desiredNames.has(l.name.toLowerCase())).map((l) => l.name);

		for (const want of desiredLabels) {
			const have = existing.find((l) => l.name.toLowerCase() === want.name.toLowerCase());
			if (!have) {
				if (!dryRun)
					yield* createLabel(owner, repo, want).pipe(
						Effect.catchAll((e) => Effect.logWarning(`Failed to create "${want.name}": ${e.reason}`)),
					);
				results.push({ name: want.name, operation: "created" });
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
				if (!dryRun)
					yield* updateLabel(owner, repo, have.name, want).pipe(
						Effect.catchAll((e) => Effect.logWarning(`Failed to update "${want.name}": ${e.reason}`)),
					);
				results.push({ name: want.name, operation: "updated", changes });
			} else {
				results.push({ name: want.name, operation: "unchanged" });
			}
		}

		if (removeCustom) {
			for (const name of customLabels) {
				if (!dryRun)
					yield* deleteLabel(owner, repo, name).pipe(
						Effect.catchAll((e) => Effect.logWarning(`Failed to remove "${name}": ${e.reason}`)),
					);
				results.push({ name, operation: "removed" });
			}
		}

		return { results, customLabels };
	});
