/**
 * Action input parsing and validation.
 *
 * @remarks
 * Parses raw GitHub Actions inputs into a validated {@link ActionInputs}
 * object. Custom properties use `key=value` multiline format with AND logic.
 * At least one discovery method (repos or custom-properties) must be configured.
 *
 * @module inputs
 */

import * as core from "@actions/core";
import { Effect } from "effect";

import { InvalidInputError } from "./schemas/errors.js";
import type { ActionInputs, CustomProperty } from "./schemas/index.js";

/**
 * Parse a multiline string into non-empty trimmed lines.
 * Blank lines and lines starting with # are ignored.
 *
 * @param raw - Raw multiline input string
 * @returns Array of non-empty, non-comment lines
 *
 * @internal
 */
export function parseMultilineInput(raw: string): ReadonlyArray<string> {
	return raw
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Parse custom-properties multiline input into key=value pairs.
 * Each non-blank, non-comment line must be in `key=value` format.
 *
 * @param raw - Raw multiline input string
 * @returns Effect yielding parsed property pairs, or failing with {@link InvalidInputError}
 *
 * @internal
 */
export function parseCustomProperties(raw: string): Effect.Effect<ReadonlyArray<CustomProperty>, InvalidInputError> {
	if (!raw.trim()) {
		return Effect.succeed([]);
	}

	const lines = parseMultilineInput(raw);
	const results: Array<CustomProperty> = [];

	for (const line of lines) {
		const eqIndex = line.indexOf("=");
		if (eqIndex === -1) {
			return Effect.fail(
				new InvalidInputError({
					field: "custom-properties",
					value: line,
					reason: `Expected "key=value" format, got "${line}"`,
				}),
			);
		}

		const key = line.slice(0, eqIndex).trim();
		const value = line.slice(eqIndex + 1).trim();

		if (!key) {
			return Effect.fail(
				new InvalidInputError({
					field: "custom-properties",
					value: line,
					reason: "Property key must not be empty",
				}),
			);
		}

		if (!value) {
			return Effect.fail(
				new InvalidInputError({
					field: "custom-properties",
					value: line,
					reason: `Property value for "${key}" must not be empty`,
				}),
			);
		}

		results.push({ key, value });
	}

	return Effect.succeed(results);
}

/**
 * Parse repos multiline input into a repo name array.
 *
 * @param raw - Raw multiline input string
 * @returns Array of repo name strings
 *
 * @internal
 */
export function parseReposInput(raw: string): ReadonlyArray<string> {
	if (!raw.trim()) {
		return [];
	}
	return parseMultilineInput(raw);
}

/**
 * Parse a boolean input string (GitHub Actions uses "true"/"false" strings).
 */
function parseBooleanInput(name: string): boolean {
	return core.getInput(name).toLowerCase().trim() === "true";
}

/**
 * Check if the action is running in debug mode.
 *
 * @returns `true` when the `log-level` input is set to `"debug"`
 *
 * @internal
 */
export function isDebugMode(): boolean {
	return core.getInput("log-level").toLowerCase().trim() === "debug";
}

/**
 * Parse and validate all action inputs.
 *
 * @remarks
 * Required inputs (`app-id`, `app-private-key`, `config-file`) are fetched
 * with `required: true` which causes `core.getInput` to throw if missing.
 * At least one discovery method must be configured via `repos` or
 * `custom-properties`.
 *
 * @internal
 */
export const parseInputs: Effect.Effect<ActionInputs, InvalidInputError> = Effect.gen(function* () {
	const appId = core.getInput("app-id", { required: true });
	const appPrivateKey = core.getInput("app-private-key", { required: true });
	const configFile = core.getInput("config-file", { required: true });

	const customProperties = yield* parseCustomProperties(core.getInput("custom-properties"));
	const repos = parseReposInput(core.getInput("repos"));

	if (customProperties.length === 0 && repos.length === 0) {
		return yield* Effect.fail(
			new InvalidInputError({
				field: "repos / custom-properties",
				value: undefined,
				reason: "At least one discovery method must be configured: provide 'repos' and/or 'custom-properties'",
			}),
		);
	}

	const logLevelRaw = core.getInput("log-level") || "info";
	const logLevel = logLevelRaw.toLowerCase().trim();

	if (logLevel !== "info" && logLevel !== "debug") {
		return yield* Effect.fail(
			new InvalidInputError({
				field: "log-level",
				value: logLevelRaw,
				reason: 'Must be "info" or "debug"',
			}),
		);
	}

	return {
		appId,
		appPrivateKey,
		configFile,
		customProperties: [...customProperties],
		repos: [...repos],
		dryRun: parseBooleanInput("dry-run"),
		removeCustomLabels: parseBooleanInput("remove-custom-labels"),
		syncSettings: parseBooleanInput("sync-settings"),
		syncProjects: parseBooleanInput("sync-projects"),
		skipBackfill: parseBooleanInput("skip-backfill"),
		logLevel: logLevel as "info" | "debug",
		skipTokenRevoke: parseBooleanInput("skip-token-revoke"),
	};
});
