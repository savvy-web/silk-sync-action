import { FetchHttpClient } from "@effect/platform";
import { NodeContext, NodeFileSystem } from "@effect/platform-node";
import {
	ActionStateLive,
	ConfigLoaderLive,
	GitHubAppLive,
	GitHubGraphQLLive,
	GitHubToken,
	OctokitAuthAppLive,
} from "@savvy-web/github-action-effects";
import { Layer } from "effect";

/** pre/post: GitHubApp (for token provision/dispose) + filesystem for ActionState. */
export const PreLive = Layer.mergeAll(
	GitHubAppLive.pipe(Layer.provide(OctokitAuthAppLive), Layer.provide(FetchHttpClient.layer)),
	NodeFileSystem.layer,
);
export const PostLive = PreLive;

/** main: GitHubClient (built from the persisted installation token) + GraphQL + ConfigLoader. */
const actionState = ActionStateLive.pipe(Layer.provide(NodeContext.layer));
const githubClient = GitHubToken.client().pipe(Layer.provide(actionState), Layer.orDie);
const githubGraphql = GitHubGraphQLLive.pipe(Layer.provide(githubClient));
const configLoader = ConfigLoaderLive.pipe(Layer.provide(NodeContext.layer));

export const MainLive = Layer.mergeAll(githubClient, githubGraphql, configLoader);
