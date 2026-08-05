import type { GitHubError, RepositoryPatch } from "@effected/github";
import { GitHubClient, GitHubIssue, GitHubRepository, Repo } from "@effected/github";
import { Effect, Option, Schema } from "effect";
import type { LabelDefinition } from "../schemas.js";

/**
 * The repository fields silk-sync reads.
 *
 * @remarks
 * A structural subset of the kit's `RepositorySettings` (the whole
 * `GET /repos/{owner}/{repo}` payload), narrowed to the thirteen keys
 * `sync/settings.ts` compares plus the identity fields discovery needs.
 * Declared rather than imported so the comparator's key list and this type
 * stay in step: every optional key here is also a key of the config-side
 * `RepositorySettings` in `../schemas.ts`.
 */
export interface RepoSnapshot {
	readonly node_id: string;
	readonly name: string;
	readonly full_name: string;
	readonly owner: { readonly login: string };
	readonly has_wiki?: boolean | undefined;
	readonly has_issues?: boolean | undefined;
	readonly has_projects?: boolean | undefined;
	readonly has_discussions?: boolean | undefined;
	readonly allow_merge_commit?: boolean | undefined;
	readonly allow_squash_merge?: boolean | undefined;
	readonly squash_merge_commit_title?: string | undefined;
	readonly squash_merge_commit_message?: string | undefined;
	readonly allow_rebase_merge?: boolean | undefined;
	readonly allow_update_branch?: boolean | undefined;
	readonly delete_branch_on_merge?: boolean | undefined;
	readonly web_commit_signoff_required?: boolean | undefined;
	readonly allow_auto_merge?: boolean | undefined;
}

/** A label as GitHub reports it. */
export interface RepoLabel {
	readonly name: string;
	readonly description: string | null;
	readonly color: string;
}

/** One repository's custom-property values, as the org endpoint reports them. */
export interface OrgRepoProperty {
	readonly repository_name: string;
	readonly repository_full_name: string;
	readonly repository_node_id: string;
	readonly properties: ReadonlyArray<{ readonly property_name: string; readonly value: string | null }>;
}

/**
 * The one field octokit's generated type for
 * `GET /orgs/{org}/properties/values` omits.
 *
 * @remarks
 * GitHub returns `repository_node_id` on the wire; `@octokit/types`' generated
 * map does not declare it. Decoding recovers it without a cast, and the
 * `Option`-returning decoder keeps the read total — a row missing the field is
 * absence, not a failure, exactly as the value it replaced (`?? ""`) treated it.
 */
const RowNodeId = Schema.Struct({ repository_node_id: Schema.optional(Schema.String) });
const decodeRowNodeId = Schema.decodeUnknownOption(RowNodeId);

const nodeIdOf = (row: unknown): string =>
	Option.match(decodeRowNodeId(row), {
		onNone: () => "",
		onSome: (decoded) => decoded.repository_node_id ?? "",
	});

/** The repository the ambient {@link Repo} points at. */
export const getRepo: Effect.Effect<RepoSnapshot, GitHubError, GitHubClient | Repo> = Effect.gen(function* () {
	const { owner, repo } = yield* Repo;
	const client = yield* GitHubClient;
	return yield* client.request("GET /repos/{owner}/{repo}", { owner, repo });
});

/** Every label on the ambient repository. */
export const listLabels: Effect.Effect<ReadonlyArray<RepoLabel>, GitHubError, GitHubClient | Repo> = Effect.gen(
	function* () {
		const { owner, repo } = yield* Repo;
		const client = yield* GitHubClient;
		return yield* client.paginate("GET /repos/{owner}/{repo}/labels", { owner, repo });
	},
);

/** Create a label on the ambient repository. */
export const createLabel = (label: LabelDefinition): Effect.Effect<void, GitHubError, GitHubClient | Repo> =>
	Effect.gen(function* () {
		const { owner, repo } = yield* Repo;
		const client = yield* GitHubClient;
		yield* client.request("POST /repos/{owner}/{repo}/labels", {
			owner,
			repo,
			name: label.name,
			description: label.description,
			color: label.color,
		});
	});

/** Rewrite the label currently named `currentName` to match `label`. */
export const updateLabel = (
	currentName: string,
	label: LabelDefinition,
): Effect.Effect<void, GitHubError, GitHubClient | Repo> =>
	Effect.gen(function* () {
		const { owner, repo } = yield* Repo;
		const client = yield* GitHubClient;
		yield* client.request("PATCH /repos/{owner}/{repo}/labels/{name}", {
			owner,
			repo,
			name: currentName,
			new_name: label.name,
			description: label.description,
			color: label.color,
		});
	});

/** Delete a label from the ambient repository. */
export const deleteLabel = (name: string): Effect.Effect<void, GitHubError, GitHubClient | Repo> =>
	Effect.gen(function* () {
		const { owner, repo } = yield* Repo;
		const client = yield* GitHubClient;
		yield* client.request("DELETE /repos/{owner}/{repo}/labels/{name}", { owner, repo, name });
	});

/**
 * Apply a settings patch to the ambient repository.
 *
 * @remarks
 * `RepositoryPatch` is the kit's `Omit<Params<"PATCH /repos/{owner}/{repo}">,
 * "owner" | "repo">` — the route types the patch, so a key the endpoint does
 * not accept is a compile error rather than a silently ignored field.
 */
export const updateRepo = (settings: RepositoryPatch): Effect.Effect<void, GitHubError, GitHubRepository | Repo> =>
	Effect.gen(function* () {
		const repository = yield* GitHubRepository;
		yield* repository.updateSettings(settings);
	});

/** Every open issue on the ambient repository, with its GraphQL node id. */
export const listOpenIssues: Effect.Effect<
	ReadonlyArray<{ readonly nodeId: string }>,
	GitHubError,
	GitHubIssue | Repo
> = Effect.gen(function* () {
	const issues = yield* GitHubIssue;
	return yield* issues.list({ state: "open" });
});

/**
 * Every repository in `org`, with its custom-property values.
 *
 * @remarks
 * The route is in octokit's paginating map, so this is typed end to end — the
 * pre-port implementation reached it through an untyped `octokit.request()`
 * escape hatch. `value` arrives as `string | string[] | null`; silk-sync never
 * matches on a multi-select property, so a non-string narrows to `null`.
 */
export const listOrgRepoProperties = (
	org: string,
): Effect.Effect<ReadonlyArray<OrgRepoProperty>, GitHubError, GitHubClient> =>
	Effect.gen(function* () {
		const client = yield* GitHubClient;
		const rows = yield* client.paginate("GET /orgs/{org}/properties/values", { org });
		return rows.map(
			(row): OrgRepoProperty => ({
				repository_name: row.repository_name,
				repository_full_name: row.repository_full_name,
				repository_node_id: nodeIdOf(row),
				properties: row.properties.map((property) => ({
					property_name: property.property_name,
					value: typeof property.value === "string" ? property.value : null,
				})),
			}),
		);
	});
