import { Action, ActionEnvironment, ActionInput, ActionState, GitHubToken } from "@effected/github-actions";
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

	// The kit's `provision` takes the App credentials as arguments rather than
	// reading them itself, so these two inputs are read here — under exactly the
	// names `action.yml` declares.
	const appId = yield* ActionInput.string("app-client-id");
	const privateKey = yield* ActionInput.redacted("app-private-key");
	// The installation is resolved by owner, matching the pre-port behavior; an
	// App installed in more than one account would otherwise pick its only one.
	const { repositoryOwner: owner } = yield* Effect.flatMap(ActionEnvironment, (env) => env.github);

	yield* Effect.logInfo("Generating GitHub App installation token...");
	const token = yield* GitHubToken.provision({
		appId,
		privateKey,
		owner,
		required: REQUIRED_PERMISSIONS,
	});
	yield* Effect.logInfo(`Token generated (expires: ${token.expiresAt})`);
});

/* v8 ignore next 3 */
if (process.env.GITHUB_ACTIONS) {
	await Action.run(pre, { layer: PreLive });
}
