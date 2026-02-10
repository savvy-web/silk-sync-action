/**
 * Logging utilities for the action.
 *
 * @remarks
 * Provides debug logging that respects the `log-level` input.
 * When debug mode is enabled, debug messages are promoted to `info`
 * level with a `[DEBUG]` prefix so they appear in standard output.
 *
 * @module logging
 */

import { debug, info } from "@actions/core";
import { Effect } from "effect";

import { isDebugMode } from "./inputs.js";

/**
 * Log a debug message (only visible when debug mode is enabled).
 *
 * @param message - The message to log
 *
 * @internal
 */
export function logDebug(message: string): Effect.Effect<void> {
	return Effect.sync(() => {
		if (isDebugMode()) {
			info(`[DEBUG] ${message}`);
		} else {
			debug(message);
		}
	});
}

/**
 * Log detailed object state for debugging.
 *
 * @param label - A label describing the state being logged
 * @param state - The value to serialize and log
 *
 * @internal
 */
export function logDebugState(label: string, state: unknown): Effect.Effect<void> {
	return Effect.sync(() => {
		if (isDebugMode()) {
			info(`[DEBUG] ${label}:`);
			info(JSON.stringify(state, null, 2));
		} else {
			debug(`${label}: ${JSON.stringify(state)}`);
		}
	});
}
