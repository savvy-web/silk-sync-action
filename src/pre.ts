/**
 * Pre step: authentication, config validation, and input parsing.
 *
 * Runs before the main step. Generates a GitHub App installation token,
 * validates the config file, parses all inputs, and saves state for
 * the main and post steps. Fails fast on any validation error.
 *
 * @module pre
 */

import * as core from "@actions/core";
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";

import { loadAndValidateConfig } from "./lib/config/load.js";
import { generateInstallationToken } from "./lib/github/auth.js";
import { parseInputs } from "./lib/inputs.js";

const program = Effect.gen(function* () {
	const startTime = Date.now();
	core.saveState("startTime", String(startTime));

	// 1. Parse and validate all inputs
	core.info("Validating inputs...");
	const inputs = yield* parseInputs;
	core.saveState("inputs", JSON.stringify(inputs));

	// 2. Generate GitHub App installation token
	core.info("Generating GitHub App installation token...");
	const tokenInfo = yield* generateInstallationToken(inputs.appId, inputs.appPrivateKey);
	core.saveState("token", tokenInfo.token);
	core.saveState("skipTokenRevoke", String(inputs.skipTokenRevoke));
	core.setSecret(tokenInfo.token);

	core.info(`Authenticated as "${tokenInfo.appSlug}" (expires: ${tokenInfo.expiresAt})`);

	// 3. Validate config file
	core.info(`Loading config from ${inputs.configFile}...`);
	const config = yield* loadAndValidateConfig(inputs.configFile);
	core.saveState("config", JSON.stringify(config));

	core.info(`Config loaded: ${config.labels.length} labels, ${Object.keys(config.settings).length} settings`);
	core.info("Pre step complete.");
}).pipe(
	Effect.catchAll((error) =>
		Effect.sync(() => {
			const message = error instanceof Error ? error.message : String(error);
			core.setFailed(`Pre step failed: ${message}`);
		}),
	),
);

NodeRuntime.runMain(program);
