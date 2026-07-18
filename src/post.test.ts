import { ActionStateTest, GitHubAppTest } from "@savvy-web/github-action-effects/testing";
import { ConfigProvider, Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { post } from "./post.js";

describe("post", () => {
	it("disposes the token without throwing when no token is persisted", async () => {
		const state = ActionStateTest.empty();
		const app = GitHubAppTest.empty();
		const layer = Layer.mergeAll(ActionStateTest.layer(state), GitHubAppTest.layer(app));
		const cfg = ConfigProvider.fromUnknown({});
		await expect(
			post.pipe(
				Effect.provide(ConfigProvider.layer(cfg)),
				Effect.provide(layer),
				Effect.provide(Logger.layer([])),
				Effect.runPromise,
			),
		).resolves.toBeUndefined();
	});

	it("logs duration when a start time was persisted", async () => {
		const state = ActionStateTest.empty();
		state.entries.set("startTime", JSON.stringify({ startedAt: 1000 }));
		const app = GitHubAppTest.empty();
		const layer = Layer.mergeAll(ActionStateTest.layer(state), GitHubAppTest.layer(app));
		const cfg = ConfigProvider.fromUnknown({});
		await expect(
			post.pipe(
				Effect.provide(ConfigProvider.layer(cfg)),
				Effect.provide(layer),
				Effect.provide(Logger.layer([])),
				Effect.runPromise,
			),
		).resolves.toBeUndefined();
	});
});
