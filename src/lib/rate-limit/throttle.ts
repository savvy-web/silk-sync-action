/**
 * Rate limit checking and throttling.
 *
 * @remarks
 * Monitors GitHub API rate limits and pauses execution when limits
 * are low to prevent exhaustion. Both REST and GraphQL rate limits
 * are tracked independently with different thresholds.
 *
 * @module rate-limit/throttle
 */

import { info, warning } from "@actions/core";
import { Effect } from "effect";

import { logDebug } from "../logging.js";
import { GitHubRestClient } from "../services/types.js";

/** Interval at which to check REST rate limit (every N repos). */
export const REST_CHECK_INTERVAL = 10;

/** Interval at which to check GraphQL rate limit (every N backfill pages). */
export const GRAPHQL_CHECK_INTERVAL = 3;

/** Delay between processing repos (ms). */
export const INTER_REPO_DELAY_MS = 1000;

/** Delay between backfill item additions (ms). */
export const INTER_ITEM_DELAY_MS = 100;

/** REST rate limit thresholds. */
const REST_WARNING_THRESHOLD = 100;
const REST_PAUSE_THRESHOLD = 50;
const REST_PAUSE_DURATION_MS = 60_000;

/** GraphQL rate limit thresholds. */
const GRAPHQL_PAUSE_THRESHOLD = 100;
const GRAPHQL_PAUSE_DURATION_MS = 30_000;

/**
 * Delay execution for the specified number of milliseconds.
 *
 * @param ms - Milliseconds to wait
 *
 * @internal
 */
export function delay(ms: number): Effect.Effect<void> {
	return Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
}

/**
 * Check REST API rate limit and pause if needed.
 *
 * @remarks
 * Should be called every {@link REST_CHECK_INTERVAL} repos (typically every 10).
 * Pauses for 60 seconds when remaining calls drop below 50,
 * and logs a warning when below 100.
 *
 * @returns The number of remaining API calls
 *
 * @internal
 */
export function checkRestRateLimit(): Effect.Effect<number, never, GitHubRestClient> {
	return Effect.gen(function* () {
		const rest = yield* Effect.serviceOption(GitHubRestClient);

		if (rest._tag === "None") {
			return Number.MAX_SAFE_INTEGER;
		}

		const rateLimit = yield* rest.value.getRateLimit().pipe(Effect.catchAll(() => Effect.succeed(null)));

		if (!rateLimit) {
			yield* logDebug("Could not fetch rate limit, continuing...");
			return Number.MAX_SAFE_INTEGER;
		}

		const { remaining, reset } = rateLimit.core;
		const resetTime = new Date(reset * 1000).toISOString();

		yield* logDebug(`REST rate limit: ${remaining} remaining (resets at ${resetTime})`);

		if (remaining < REST_PAUSE_THRESHOLD) {
			yield* Effect.sync(() => warning(`Rate limit critically low: ${remaining} remaining. Pausing for 60s...`));
			yield* delay(REST_PAUSE_DURATION_MS);
		} else if (remaining < REST_WARNING_THRESHOLD) {
			yield* Effect.sync(() => warning(`Rate limit low: ${remaining} remaining (resets at ${resetTime})`));
		}

		return remaining;
	});
}

/**
 * Check GraphQL rate limit and pause if needed.
 *
 * @remarks
 * Should be called every {@link GRAPHQL_CHECK_INTERVAL} backfill pages
 * (typically every 3). Pauses for 30 seconds when remaining points
 * drop below 100.
 *
 * @returns The number of remaining GraphQL points
 *
 * @internal
 */
export function checkGraphQLRateLimit(): Effect.Effect<number, never, GitHubRestClient> {
	return Effect.gen(function* () {
		const rest = yield* Effect.serviceOption(GitHubRestClient);

		if (rest._tag === "None") {
			return Number.MAX_SAFE_INTEGER;
		}

		const rateLimit = yield* rest.value.getRateLimit().pipe(Effect.catchAll(() => Effect.succeed(null)));

		if (!rateLimit) {
			return Number.MAX_SAFE_INTEGER;
		}

		const { remaining, reset } = rateLimit.graphql;
		const resetTime = new Date(reset * 1000).toISOString();

		yield* logDebug(`GraphQL rate limit: ${remaining} remaining (resets at ${resetTime})`);

		if (remaining < GRAPHQL_PAUSE_THRESHOLD) {
			yield* Effect.sync(() => info(`GraphQL rate limit low (${remaining} remaining), pausing for 30s...`));
			yield* delay(GRAPHQL_PAUSE_DURATION_MS);
		}

		return remaining;
	});
}
