import { AppIdentity, GitHubApp, InstallationToken } from "@effected/github";
import { ActionEnvironment, ActionInput, ActionOutputs, ActionState } from "@effected/github-actions";
import { DateTime, Effect, Exit, Layer, Logger, Redacted, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSIONS, pre } from "./pre.js";

const tokenWith = (permissions: Readonly<Record<string, string>>): InstallationToken =>
	new InstallationToken({
		token: Redacted.make("ghs_test_token_123"),
		expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
		installationId: 12345,
		permissions,
	});

const arrange = (options: {
	readonly permissions: Readonly<Record<string, string>>;
	readonly saved: Map<string, string>;
	readonly secrets: Array<string>;
	readonly tokenRequests: Array<{ readonly owner?: string | undefined }>;
}) =>
	Layer.mergeAll(
		ActionInput.layer({ "app-client-id": "cid", "app-private-key": "pk" }),
		ActionEnvironment.layerTest({ GITHUB_REPOSITORY: "acme/silk", GITHUB_REPOSITORY_OWNER: "acme" }),
		ActionOutputs.layerTest({
			setSecret: (value) =>
				Effect.sync(() => {
					options.secrets.push(value);
				}),
		}),
		ActionState.layerTest({
			save: (key, value, schema) =>
				Schema.encodeEffect(schema)(value).pipe(
					Effect.orDie,
					Effect.flatMap((encoded) =>
						Effect.sync(() => {
							options.saved.set(key, JSON.stringify(encoded));
						}),
					),
				),
		}),
		GitHubApp.layerTest({
			token: (request) =>
				Effect.sync(() => {
					options.tokenRequests.push({ owner: request.owner });
					return tokenWith(options.permissions);
				}),
			revoke: () => Effect.void,
			// `provision` enriches the persisted token with the app's identity.
			identity: () => Effect.succeed(new AppIdentity({ slug: "test-app", name: "Test App", userId: 99999 })),
		}),
	);

describe("pre", () => {
	it("provisions a token, masks it, and saves the start time", async () => {
		const saved = new Map<string, string>();
		const secrets: Array<string> = [];
		const tokenRequests: Array<{ readonly owner?: string | undefined }> = [];
		const layer = arrange({ permissions: { ...REQUIRED_PERMISSIONS }, saved, secrets, tokenRequests });

		const exit = await pre.pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromiseExit);

		expect(Exit.isSuccess(exit)).toBe(true);
		expect(saved.has("startTime")).toBe(true);
		expect(secrets).toContain("ghs_test_token_123");
	});

	it("resolves the installation by the repository owner", async () => {
		const tokenRequests: Array<{ readonly owner?: string | undefined }> = [];
		const layer = arrange({
			permissions: { ...REQUIRED_PERMISSIONS },
			saved: new Map(),
			secrets: [],
			tokenRequests,
		});
		await pre.pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromiseExit);
		expect(tokenRequests[0]?.owner).toBe("acme");
	});

	it("fails when the minted token is missing a required permission", async () => {
		const { organization_projects: _dropped, ...narrower } = REQUIRED_PERMISSIONS;
		const layer = arrange({ permissions: narrower, saved: new Map(), secrets: [], tokenRequests: [] });

		const exit = await pre.pipe(Effect.provide(layer), Effect.provide(Logger.layer([])), Effect.runPromiseExit);

		expect(Exit.isFailure(exit)).toBe(true);
	});
});
