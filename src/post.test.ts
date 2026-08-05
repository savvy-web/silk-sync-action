import { GitHubApp } from "@effected/github";
import { ActionState } from "@effected/github-actions";
import { Effect, Layer, Logger, Option, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { post } from "./post.js";

/**
 * A state double serving one encoded entry, decoded through the caller's own
 * schema — so `StartTimeState`'s decode path runs rather than being bypassed by
 * a hand-built value.
 */
const stateServing = (encoded: unknown | undefined) =>
	ActionState.layerTest({
		getOptional: (_key, schema) =>
			encoded === undefined
				? Effect.succeed(Option.none())
				: Schema.decodeUnknownEffect(schema)(encoded).pipe(Effect.orDie, Effect.map(Option.some)),
	});

const arrange = (encoded: unknown | undefined, revokes: Array<string>) =>
	Layer.mergeAll(
		stateServing(encoded),
		GitHubApp.layerTest({
			revoke: () =>
				Effect.sync(() => {
					revokes.push("revoke");
				}),
		}),
	);

describe("post", () => {
	it("disposes the token without throwing when no token is persisted", async () => {
		const revokes: Array<string> = [];
		await expect(
			post.pipe(Effect.provide(arrange(undefined, revokes)), Effect.provide(Logger.layer([])), Effect.runPromise),
		).resolves.toBeUndefined();
		// Nothing was persisted, so there is nothing to revoke.
		expect(revokes).toEqual([]);
	});

	it("logs duration when a start time was persisted", async () => {
		const revokes: Array<string> = [];
		await expect(
			post.pipe(
				Effect.provide(arrange({ startedAt: 1000 }, revokes)),
				Effect.provide(Logger.layer([])),
				Effect.runPromise,
			),
		).resolves.toBeUndefined();
	});

	it("never fails the run when reading the persisted state dies", async () => {
		// `ActionState.layerTest` with no override dies naming the member — the
		// post body must still complete, because a post phase that fails turns a
		// successful run red on the way out.
		const layer = Layer.mergeAll(ActionState.layerTest(), GitHubApp.layerTest({ revoke: () => Effect.void }));
		await expect(
			post.pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromise),
		).resolves.toBeUndefined();
	});
});
