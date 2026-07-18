import { ActionInput } from "@savvy-web/github-action-effects";
import { Config, Effect } from "effect";
import { InvalidInputError } from "./errors.js";
import type { CustomProperty } from "./schemas.js";

export interface SilkInputs {
	readonly configFile: string;
	readonly customProperties: ReadonlyArray<CustomProperty>;
	readonly repos: ReadonlyArray<string>;
	readonly dryRun: boolean;
	readonly removeCustomLabels: boolean;
	readonly syncSettings: boolean;
	readonly syncProjects: boolean;
	readonly skipBackfill: boolean;
}

/** Strip blank lines and `#` comments from already-split multiline input. */
const stripComments = (lines: ReadonlyArray<string>): ReadonlyArray<string> =>
	lines.map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));

const parseCustomProperties = (
	lines: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<CustomProperty>, InvalidInputError> =>
	Effect.gen(function* () {
		const out: Array<CustomProperty> = [];
		for (const line of stripComments(lines)) {
			const eq = line.indexOf("=");
			if (eq === -1) {
				return yield* Effect.fail(
					new InvalidInputError({
						field: "custom-properties",
						value: line,
						reason: `Expected "key=value", got "${line}"`,
					}),
				);
			}
			const key = line.slice(0, eq).trim();
			const value = line.slice(eq + 1).trim();
			if (!key) {
				return yield* Effect.fail(
					new InvalidInputError({
						field: "custom-properties",
						value: line,
						reason: "Property key must not be empty",
					}),
				);
			}
			if (!value) {
				return yield* Effect.fail(
					new InvalidInputError({
						field: "custom-properties",
						value: line,
						reason: `Value for "${key}" must not be empty`,
					}),
				);
			}
			out.push({ key, value });
		}
		return out;
	});

export const parseInputs: Effect.Effect<SilkInputs, InvalidInputError | Config.ConfigError> = Effect.gen(function* () {
	const configFile = yield* Config.string("config-file").pipe(Config.withDefault(".github/silk.config.json"));
	const rawProps = yield* ActionInput.multiline("custom-properties").pipe(Config.withDefault([]));
	const customProperties = yield* parseCustomProperties(rawProps);
	const repos = stripComments(yield* ActionInput.multiline("repos").pipe(Config.withDefault([])));

	if (customProperties.length === 0 && repos.length === 0) {
		return yield* Effect.fail(
			new InvalidInputError({
				field: "repos / custom-properties",
				value: undefined,
				reason: "At least one discovery method must be configured: provide 'repos' and/or 'custom-properties'",
			}),
		);
	}

	const dryRun = yield* ActionInput.boolean("dry-run").pipe(Config.withDefault(false));
	const removeCustomLabels = yield* ActionInput.boolean("remove-custom-labels").pipe(Config.withDefault(false));
	const syncSettings = yield* ActionInput.boolean("sync-settings").pipe(Config.withDefault(true));
	const syncProjects = yield* ActionInput.boolean("sync-projects").pipe(Config.withDefault(true));
	const skipBackfill = yield* ActionInput.boolean("skip-backfill").pipe(Config.withDefault(false));

	return {
		configFile,
		customProperties,
		repos: [...repos],
		dryRun,
		removeCustomLabels,
		syncSettings,
		syncProjects,
		skipBackfill,
	};
});
