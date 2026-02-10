/**
 * Combined Effect service layer for the action.
 *
 * @remarks
 * Internal modules should import service types and tags directly from
 * `./types.js`, and layer factories from `./graphql.js` or `./rest.js`.
 * This file provides only the combined application layer used by entry points.
 *
 * @module services
 */

import { Layer } from "effect";

import { makeGitHubGraphQLClientLayer } from "./graphql.js";
import { makeGitHubRestClientLayer } from "./rest.js";
import type { GitHubGraphQLClient, GitHubRestClient } from "./types.js";

/**
 * Create the combined application layer with all GitHub API services.
 *
 * @param token - GitHub App installation token
 * @returns A merged Effect layer providing both REST and GraphQL clients
 *
 * @internal
 */
export function makeAppLayer(token: string): Layer.Layer<GitHubRestClient | GitHubGraphQLClient> {
	return Layer.mergeAll(makeGitHubRestClientLayer(token), makeGitHubGraphQLClientLayer(token));
}
