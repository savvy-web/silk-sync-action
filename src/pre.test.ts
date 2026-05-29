import type { GitHubAppTestState } from "@savvy-web/github-action-effects/testing";
import { ActionOutputsTest, ActionStateTest, GitHubAppTest } from "@savvy-web/github-action-effects/testing";
import { ConfigProvider, Effect, Layer, Logger, Redacted } from "effect";
import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSIONS, pre } from "./pre.js";

/** A test GitHub App whose minted token grants exactly the permissions `pre` requires. */
const appStateWithPermissions = (): GitHubAppTestState => ({
	generateCalls: [],
	revokeCalls: [],
	tokenToReturn: {
		token: Redacted.make("ghs_test_token_123"),
		expiresAt: "2099-01-01T00:00:00Z",
		installationId: 12345,
		permissions: { ...REQUIRED_PERMISSIONS },
	},
	appIdentity: { appSlug: "test-app", appUserId: 99999, appName: "Test App" },
});

describe("pre", () => {
	it("provisions a token and saves start time", async () => {
		const outputs = ActionOutputsTest.empty();
		const state = ActionStateTest.empty();
		const app = appStateWithPermissions();
		const layer = Layer.mergeAll(
			ActionOutputsTest.layer(outputs),
			ActionStateTest.layer(state),
			GitHubAppTest.layer(app),
		);
		const cfg = ConfigProvider.fromMap(
			new Map([
				["app-client-id", "cid"],
				["app-private-key", "pk"],
			]),
		);
		await pre.pipe(
			Effect.withConfigProvider(cfg),
			Effect.provide(layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
			Effect.runPromise,
		);
		expect(state.entries.has("startTime")).toBe(true);
		expect(app.generateCalls.length).toBeGreaterThanOrEqual(1);
	});
});
