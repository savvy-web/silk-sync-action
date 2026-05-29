import { Action, ActionState, GitHubToken } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { PreLive } from "./layers/app.js";
import { STATE_KEYS, StartTimeState } from "./state.js";

/**
 * Fine-grained installation permissions silk-sync requires. `provision` verifies
 * the minted token grants at least these before persisting, failing fast otherwise.
 */
export const REQUIRED_PERMISSIONS = {
	administration: "write",
	issues: "write",
	organization_custom_properties: "read",
	organization_projects: "write",
} as const;

export const pre = Effect.gen(function* () {
	const state = yield* ActionState;
	yield* state.save(STATE_KEYS.startTime, new StartTimeState({ startedAt: Date.now() }), StartTimeState);

	yield* Effect.logInfo("Generating GitHub App installation token...");
	const token = yield* GitHubToken.provision({ permissions: REQUIRED_PERMISSIONS });
	yield* Effect.logInfo(`Token generated (expires: ${token.expiresAt})`);
});

/* v8 ignore next 3 */
if (process.env.GITHUB_ACTIONS) {
	await Action.run(pre, { layer: PreLive });
}
