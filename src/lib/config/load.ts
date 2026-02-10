/**
 * Configuration file loader.
 *
 * @remarks
 * Reads and validates user-provided JSON config files against the
 * {@link SilkConfig} Effect Schema. Produces detailed error messages
 * when schema validation fails, listing each invalid field.
 *
 * @module config/load
 */

import { readFile } from "node:fs/promises";
import { Effect, Schema } from "effect";
import { ArrayFormatter } from "effect/ParseResult";
import { ConfigLoadError } from "../schemas/errors.js";
import type { SilkConfig } from "../schemas/index.js";
import { SilkConfig as SilkConfigSchema } from "../schemas/index.js";

/**
 * Load and validate a silk config JSON file.
 *
 * @param configPath - Absolute or relative path to the JSON config file
 * @returns Effect yielding a validated {@link SilkConfig}, or failing with {@link ConfigLoadError}
 *
 * @internal
 */
export function loadAndValidateConfig(configPath: string): Effect.Effect<SilkConfig, ConfigLoadError> {
	return Effect.gen(function* () {
		const rawContent = yield* Effect.tryPromise({
			try: () => readFile(configPath, "utf-8"),
			catch: (e) =>
				new ConfigLoadError({
					path: configPath,
					reason: `File not found or not readable: ${e}`,
				}),
		});

		const parsed = yield* Effect.try({
			try: () => JSON.parse(rawContent) as unknown,
			catch: (e) =>
				new ConfigLoadError({
					path: configPath,
					reason: `Invalid JSON: ${e}`,
				}),
		});

		const result = Schema.decodeUnknownEither(SilkConfigSchema)(parsed);

		if (result._tag === "Left") {
			const issues = ArrayFormatter.formatErrorSync(result.left);
			const details = issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");

			return yield* Effect.fail(
				new ConfigLoadError({
					path: configPath,
					reason: `Schema validation failed:\n${details}`,
				}),
			);
		}

		return result.right;
	});
}
