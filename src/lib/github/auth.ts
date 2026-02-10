/**
 * GitHub App authentication utilities.
 *
 * @remarks
 * Handles the full GitHub App authentication lifecycle: generating
 * installation tokens from app credentials and revoking them during
 * cleanup. Uses `@octokit/auth-app` for JWT generation and
 * `@octokit/request` for raw API calls.
 *
 * @module github/auth
 */

import { context } from "@actions/github";
import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";
import { Effect } from "effect";
import { AuthenticationError } from "../schemas/errors.js";
import type { InstallationToken } from "../schemas/index.js";

/**
 * Generate an installation token from GitHub App credentials.
 *
 * @param appId - The GitHub App ID
 * @param privateKey - The GitHub App private key in PEM format
 * @returns Effect yielding an {@link InstallationToken}, or failing with {@link AuthenticationError}
 *
 * @internal
 */
export function generateInstallationToken(
	appId: string,
	privateKey: string,
): Effect.Effect<InstallationToken, AuthenticationError> {
	return Effect.gen(function* () {
		yield* Effect.logInfo("Generating GitHub App installation token...");

		const auth = createAppAuth({ appId, privateKey, request });

		const appAuth = yield* Effect.tryPromise({
			try: () => auth({ type: "app" }),
			catch: (e) =>
				new AuthenticationError({
					reason: `Failed to authenticate as GitHub App: ${e}`,
					appId,
				}),
		});

		yield* Effect.logDebug(`App authenticated, getting installation for ${context.repo.owner}/${context.repo.repo}`);

		const installationId = yield* Effect.tryPromise({
			try: async () => {
				const response = await request("GET /repos/{owner}/{repo}/installation", {
					owner: context.repo.owner,
					repo: context.repo.repo,
					headers: { authorization: `Bearer ${appAuth.token}` },
				});
				return response.data.id;
			},
			catch: (e) =>
				new AuthenticationError({
					reason: `Failed to get installation ID: ${e}. Ensure the GitHub App is installed on this repository.`,
					appId,
				}),
		});

		yield* Effect.logDebug(`Installation ID: ${installationId}`);

		const installationAuth = yield* Effect.tryPromise({
			try: () => auth({ type: "installation", installationId }),
			catch: (e) =>
				new AuthenticationError({
					reason: `Failed to generate installation token: ${e}`,
					appId,
				}),
		});

		const appSlug = yield* Effect.tryPromise({
			try: async () => {
				const response = await request("GET /app", {
					headers: { authorization: `Bearer ${appAuth.token}` },
				});
				return response.data?.slug ?? "unknown";
			},
			catch: () =>
				new AuthenticationError({
					reason: "Failed to get app slug",
					appId,
				}),
		}).pipe(Effect.catchAll(() => Effect.succeed("unknown")));

		yield* Effect.logInfo(`Token generated for app "${appSlug}" (expires: ${installationAuth.expiresAt})`);

		return {
			token: installationAuth.token,
			expiresAt: installationAuth.expiresAt ?? new Date(Date.now() + 3600000).toISOString(),
			installationId,
			appSlug,
		};
	});
}

/**
 * Revoke an installation token.
 *
 * @param token - The installation token to revoke
 * @returns Effect that completes on success, or fails with {@link AuthenticationError}
 *
 * @internal
 */
export function revokeInstallationToken(token: string): Effect.Effect<void, AuthenticationError> {
	return Effect.tryPromise({
		try: async () => {
			await request("DELETE /installation/token", {
				headers: { authorization: `Bearer ${token}` },
			});
		},
		catch: (e) =>
			new AuthenticationError({
				reason: `Failed to revoke token: ${e}`,
			}),
	});
}
