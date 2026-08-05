import { GitHubApp, GitHubIssue, GitHubRepository } from "@effected/github";
import { GitHubToken } from "@effected/github-actions";
import { Layer } from "effect";

/**
 * pre/post: the GitHub App, for minting and revoking the installation token.
 *
 * @remarks
 * `GitHubApp.layer` has no requirements — it owns its own octokit and JWT
 * signing. Everything else `pre`/`post` touch (`ActionState`, `ActionOutputs`)
 * comes from `ActionRuntime.layer` inside `Action.run`.
 */
export const PreLive = GitHubApp.layer;

/** `post` needs exactly what `pre` needed. */
export const PostLive = GitHubApp.layer;

/**
 * main: the GitHub client, built from the token `pre` persisted.
 *
 * @remarks
 * The `orDie` is load-bearing rather than sloppy: `ActionRunOptions.layer` is
 * `Layer.Layer<R, never, ActionServices>`, so a layer handed to `Action.run`
 * has to discharge its error channel. A missing or expired persisted token is
 * a failure of the `pre` phase, not something `main` can recover from.
 */
const githubClient = GitHubToken.clientLayer().pipe(Layer.orDie);

export const MainLive = Layer.mergeAll(
	githubClient,
	GitHubRepository.layer.pipe(Layer.provide(githubClient)),
	GitHubIssue.layer.pipe(Layer.provide(githubClient)),
);
