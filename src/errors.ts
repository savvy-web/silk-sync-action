import { Schema } from "effect";
import { NonEmptyString, RepoSyncResult } from "./schemas.js";

export class InvalidInputError extends Schema.TaggedError<InvalidInputError>()("InvalidInputError", {
	field: NonEmptyString,
	value: Schema.Unknown,
	reason: NonEmptyString,
}) {
	get message(): string {
		return `Invalid input for "${this.field}": ${this.reason}`;
	}
}

export class DiscoveryError extends Schema.TaggedError<DiscoveryError>()("DiscoveryError", {
	reason: NonEmptyString,
}) {
	get message(): string {
		return `Repository discovery failed: ${this.reason}`;
	}
}

/**
 * A repository whose sync recorded errors.
 *
 * @remarks
 * Raised only so the repository's `ActionLogger.step` ends as a failure (`✗`,
 * detail unfolded) rather than a success; `processRepos` recovers it straight
 * back into its {@link RepoSyncResult}, so a failed repository is still never
 * fatal to the run.
 */
export class RepoSyncFailure extends Schema.TaggedError<RepoSyncFailure>()("RepoSyncFailure", {
	result: RepoSyncResult,
}) {
	get message(): string {
		const { errors } = this.result;
		const first = errors[0];
		const count = `${errors.length} ${errors.length === 1 ? "error" : "errors"}`;
		return first ? `${count}: ${first.operation} ${first.target}: ${first.error}` : count;
	}
}
