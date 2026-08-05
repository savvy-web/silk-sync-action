/**
 * Shared test doubles.
 *
 * @remarks
 * Not part of the action — nothing under `src/` outside the three entry points
 * is bundled. It lives here rather than in a `__test__/` tree because this
 * repository colocates its `*.test.ts` files with the code they cover.
 *
 * The shape is deliberate: the **real** `GitHubRepository` and `GitHubIssue`
 * layers run over a recorded-response client, so route interpolation, response
 * projection and pagination all execute rather than being asserted. Only the
 * transport is canned.
 *
 * @module test-support
 */

import type { GitHubClientShape } from "@effected/github";
import { GitHubClient, GitHubGraphQLError, GitHubIssue, GitHubRepository, Repo, RepoRef } from "@effected/github";
import { Effect, Layer } from "effect";

/** What a scripted GraphQL document answers with. */
export type GraphQLScript =
	| { readonly ok: true; readonly data: unknown }
	| { readonly ok: false; readonly kind: "alreadyExists" | "rejected" | "notFound" };

export interface GitHubTestOptions {
	/** Keyed by route literal; the `data` a `request` answers with. */
	readonly request?: Readonly<Record<string, unknown>>;
	/** Keyed by route literal; the whole collection, paged for real on demand. */
	readonly paginate?: Readonly<Record<string, ReadonlyArray<unknown>>>;
	/** Keyed by `GraphQLDocument.name`. An unscripted document fails, it does not die. */
	readonly graphql?: Readonly<Record<string, GraphQLScript>>;
	/** Every GraphQL document name the code under test sent, in order. */
	readonly graphqlCalls?: Array<string>;
	/** The ambient repository. Defaults to `acme/r`. */
	readonly repo?: { readonly owner: string; readonly repo: string };
}

/**
 * A recorded-response GitHub stack: client, resource services and `Repo`.
 *
 * @remarks
 * GraphQL is scripted here rather than through `GitHubClient.layerFixture`
 * because an unscripted document there is a **defect**, and every GraphQL
 * failure path in `sync/projects.ts` is a recovered *failure*. A defect is not
 * catchable by `Effect.catch`, so a fixture-only double would make those paths
 * structurally untestable — the same class of gap the kit's own notes call out.
 */
export const githubTestLayer = (
	options: GitHubTestOptions = {},
): Layer.Layer<GitHubClient | GitHubIssue | GitHubRepository | Repo> => {
	const ref = new RepoRef(options.repo ?? { owner: "acme", repo: "r" });

	const fixture = GitHubClient.layerFixture({
		...(options.request === undefined ? {} : { request: options.request }),
		...(options.paginate === undefined ? {} : { paginate: options.paginate }),
	});

	const graphql: GitHubClientShape["graphql"] = (document, _variables) => {
		options.graphqlCalls?.push(document.name);
		const script = options.graphql?.[document.name];
		if (script === undefined || script.ok === false) {
			return Effect.fail(
				new GitHubGraphQLError({
					kind: script?.ok === false ? script.kind : "rejected",
					operation: document.name,
					reason: `no fixture for ${document.name}`,
					errors: [],
				}),
			);
		}
		return document
			.decode(script.data)
			.pipe(
				Effect.mapError((error) => GitHubGraphQLError.decode(document.name, "fixture did not match its schema", error)),
			);
	};

	const client = Layer.effect(
		GitHubClient,
		Effect.map(GitHubClient, (base): GitHubClientShape => ({ ...base, graphql })),
	).pipe(Layer.provide(fixture));

	return Layer.mergeAll(
		client,
		GitHubRepository.layer.pipe(Layer.provide(client)),
		GitHubIssue.layer.pipe(Layer.provide(client)),
		Repo.layer(ref),
	);
};
