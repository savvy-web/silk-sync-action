/**
 * Shared test doubles.
 *
 * @remarks
 * Lives in `__test__/` alongside the suites it serves, so `src/` holds only
 * shipped code and a test edit never invalidates the bundle's build cache.
 *
 * The shape is deliberate: the **real** `GitHubRepository` and `GitHubIssue`
 * layers run over a recorded-response client, so route interpolation, response
 * projection and pagination all execute rather than being asserted. Only the
 * transport is canned.
 *
 * @module test-support
 */

import type { GitHubClientShape, GitHubError } from "@effected/github";
import { GitHubClient, GitHubGraphQLError, GitHubIssue, GitHubRepository, Repo, RepoRef } from "@effected/github";
import { Effect, Layer } from "effect";

/** What a scripted GraphQL document answers with. */
export type GraphQLScript =
	| { readonly ok: true; readonly data: unknown }
	| { readonly ok: false; readonly kind: "alreadyExists" | "rejected" | "notFound" };

export interface GitHubTestOptions {
	/**
	 * Keyed by route literal; the `data` a `request` answers with — or a
	 * {@link GitHubError} the call fails with.
	 *
	 * @remarks
	 * A recorded error **is** the response. Scripting a failure by leaving a
	 * route out instead is a defect that names the route: absence means
	 * "unwired", not "this endpoint rejects".
	 */
	readonly request?: Readonly<Record<string, unknown>>;
	/**
	 * Keyed by route literal; the whole collection, paged for real on demand —
	 * or a {@link GitHubError} the paginated read fails with.
	 */
	readonly paginate?: Readonly<Record<string, ReadonlyArray<unknown> | GitHubError>>;
	/** Keyed by `GraphQLDocument.name`. An unscripted document fails, it does not die. */
	readonly graphql?: Readonly<Record<string, GraphQLScript>>;
	/** Every GraphQL document name the code under test sent, in order. */
	readonly graphqlCalls?: Array<string>;
	/**
	 * Every REST call the code under test made, with the repository it was
	 * scoped to.
	 *
	 * @remarks
	 * The recorded scope is what proves a call acted on the intended repository.
	 * A result field copied from the caller's own argument cannot: it reads back
	 * the same value whether the request went to the right repository or to the
	 * ambient one.
	 */
	readonly requests?: Array<RecordedRequest>;
	/** The ambient repository. Defaults to `acme/r`. */
	readonly repo?: { readonly owner: string; readonly repo: string };
}

/** One REST call, with the `owner`/`repo` it interpolated. */
export interface RecordedRequest {
	readonly route: string;
	readonly owner: unknown;
	readonly repo: unknown;
}

/**
 * Widen request params to just the repository scope.
 *
 * @remarks
 * Every property is optional, so any object satisfies it — which is what lets
 * a generic `Rest.Params<R>` be read for `owner`/`repo` without a cast.
 */
const scopeOf = (params: object): { owner?: unknown; repo?: unknown } => params;

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
		Effect.map(GitHubClient, (base): GitHubClientShape => {
			const note = (route: string, params: object): void => {
				const { owner, repo } = scopeOf(params);
				options.requests?.push({ route, owner, repo });
			};
			const request: GitHubClientShape["request"] = (route, params) => {
				note(route, params);
				return base.request(route, params);
			};
			const paginate: GitHubClientShape["paginate"] = (route, params, pageOptions) => {
				note(route, params);
				return base.paginate(route, params, pageOptions);
			};
			return { ...base, request, paginate, graphql };
		}),
	).pipe(Layer.provide(fixture));

	return Layer.mergeAll(
		client,
		GitHubRepository.layer.pipe(Layer.provide(client)),
		GitHubIssue.layer.pipe(Layer.provide(client)),
		Repo.layer(ref),
	);
};
