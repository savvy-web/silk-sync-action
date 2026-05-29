import { Action, ActionState, GitHubToken } from "@savvy-web/github-action-effects";
import { Effect, Option } from "effect";
import { PostLive } from "./layers/app.js";
import { STATE_KEYS, StartTimeState } from "./state.js";

export const post = Effect.gen(function* () {
	const state = yield* ActionState;
	const start = yield* state.getOptional(STATE_KEYS.startTime, StartTimeState);
	if (Option.isSome(start)) {
		const duration = Date.now() - start.value.startedAt;
		yield* Effect.logInfo(`Total duration: ${(duration / 1000).toFixed(1)}s`);
	}
	yield* Effect.logInfo("Revoking installation token...");
	yield* GitHubToken.dispose().pipe(
		Effect.catchAll((e) => Effect.logWarning(`Token revocation failed: ${e instanceof Error ? e.message : String(e)}`)),
	);
}).pipe(
	Effect.catchAllDefect((d) => Effect.logWarning(`Post-action warning: ${d instanceof Error ? d.message : String(d)}`)),
);

/* v8 ignore next 3 */
if (process.env.GITHUB_ACTIONS) {
	await Action.run(post, { layer: PostLive });
}
