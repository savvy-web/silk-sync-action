/**
 * Post step: token revocation and cleanup.
 *
 * Always runs (even if main step failed). Revokes the GitHub App
 * installation token unless skip-token-revoke was set. Logs total
 * duration.
 *
 * @module post
 */

import * as core from "@actions/core";
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";

import { revokeInstallationToken } from "./lib/github/auth.js";

const program = Effect.gen(function* () {
	// Log duration if start time was recorded
	const startTime = core.getState("startTime");
	if (startTime) {
		const duration = Date.now() - Number.parseInt(startTime, 10);
		core.info(`Total duration: ${(duration / 1000).toFixed(1)}s`);
	}

	// Check if token revocation should be skipped
	const skipRevoke = core.getState("skipTokenRevoke") === "true";
	if (skipRevoke) {
		core.info("Token revocation skipped (skip-token-revoke=true).");
		return;
	}

	// Get token from state
	const token = core.getState("token");
	if (!token) {
		core.info("No token to revoke (pre step may not have completed).");
		return;
	}

	// Revoke the token
	core.info("Revoking installation token...");
	yield* revokeInstallationToken(token).pipe(
		Effect.catchAll((e) => {
			core.warning(`Failed to revoke token: ${e.message}`);
			return Effect.void;
		}),
	);
	core.info("Token revoked.");
});

NodeRuntime.runMain(program);
