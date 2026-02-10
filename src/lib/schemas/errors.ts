import { Schema } from "effect";
import { NonEmptyString } from "./index.js";

// ---------------------------------------------------------------------------
// Fatal Errors (fail in pre step)
// ---------------------------------------------------------------------------

/** Input validation error (fatal - fails in pre step). */
export class InvalidInputError extends Schema.TaggedError<InvalidInputError>()("InvalidInputError", {
	field: NonEmptyString.annotations({
		description: "The input field that failed validation",
	}),
	value: Schema.Unknown.annotations({
		description: "The invalid value that was provided",
	}),
	reason: NonEmptyString.annotations({
		description: "Human-readable explanation of why validation failed",
	}),
}) {
	get message() {
		return `Invalid input for "${this.field}": ${this.reason}`;
	}
}

/** Config file load/parse error (fatal - fails in pre step). */
export class ConfigLoadError extends Schema.TaggedError<ConfigLoadError>()("ConfigLoadError", {
	path: NonEmptyString.annotations({
		description: "Path to the config file that failed",
	}),
	reason: NonEmptyString.annotations({
		description: "Why loading/parsing failed",
	}),
}) {
	get message() {
		return `Failed to load config "${this.path}": ${this.reason}`;
	}
}

/** GitHub App authentication error (fatal - fails in pre step). */
export class AuthenticationError extends Schema.TaggedError<AuthenticationError>()("AuthenticationError", {
	reason: NonEmptyString.annotations({
		description: "Why authentication failed",
	}),
	appId: Schema.optional(Schema.String).annotations({
		description: "The GitHub App ID that failed",
	}),
}) {
	get message() {
		const appInfo = this.appId ? ` (app: ${this.appId})` : "";
		return `Authentication failed${appInfo}: ${this.reason}`;
	}
}

// ---------------------------------------------------------------------------
// Discovery Errors
// ---------------------------------------------------------------------------

/** Repo discovery error (fatal - no repos found). */
export class DiscoveryError extends Schema.TaggedError<DiscoveryError>()("DiscoveryError", {
	reason: NonEmptyString.annotations({
		description: "Why discovery failed or found no repos",
	}),
}) {
	get message() {
		return `Repository discovery failed: ${this.reason}`;
	}
}

// ---------------------------------------------------------------------------
// API Errors
// ---------------------------------------------------------------------------

/** GitHub REST API error. */
export class GitHubApiError extends Schema.TaggedError<GitHubApiError>()("GitHubApiError", {
	operation: NonEmptyString.annotations({
		description: "The API operation that failed",
	}),
	statusCode: Schema.optional(Schema.Number.pipe(Schema.between(100, 599))).annotations({
		description: "HTTP status code returned by the API",
	}),
	reason: NonEmptyString.annotations({
		description: "Error message from GitHub API",
	}),
}) {
	get message() {
		const status = this.statusCode ? ` (${this.statusCode})` : "";
		return `GitHub API error${status} during ${this.operation}: ${this.reason}`;
	}
	get isRateLimited(): boolean {
		return this.statusCode === 429;
	}
	get isNotFound(): boolean {
		return this.statusCode === 404;
	}
	get isValidationFailed(): boolean {
		return this.statusCode === 422;
	}
	get isRetryable(): boolean {
		return this.isRateLimited || (this.statusCode !== undefined && this.statusCode >= 500);
	}
}

/** GitHub GraphQL API error. */
export class GraphQLError extends Schema.TaggedError<GraphQLError>()("GraphQLError", {
	operation: NonEmptyString.annotations({
		description: "The GraphQL operation that failed",
	}),
	reason: NonEmptyString.annotations({
		description: "Error message from GraphQL response",
	}),
}) {
	get message() {
		return `GraphQL error during ${this.operation}: ${this.reason}`;
	}
	get isAlreadyExists(): boolean {
		return this.reason.includes("already") || this.reason.includes("exists");
	}
}

// ---------------------------------------------------------------------------
// Sync Errors (per-operation, non-fatal)
// ---------------------------------------------------------------------------

/** Label sync operation error (per-label, non-fatal). */
export class LabelSyncError extends Schema.TaggedError<LabelSyncError>()("LabelSyncError", {
	label: NonEmptyString.annotations({
		description: "The label name that failed",
	}),
	operation: NonEmptyString.annotations({
		description: "create, update, or remove",
	}),
	reason: NonEmptyString.annotations({
		description: "Why the operation failed",
	}),
}) {
	get message() {
		return `Label ${this.operation} failed for "${this.label}": ${this.reason}`;
	}
}

/** Settings sync error (per-repo, non-fatal). */
export class SettingsSyncError extends Schema.TaggedError<SettingsSyncError>()("SettingsSyncError", {
	repo: NonEmptyString.annotations({
		description: "The repository that failed",
	}),
	reason: NonEmptyString.annotations({
		description: "Why settings sync failed",
	}),
}) {
	get message() {
		return `Settings sync failed for "${this.repo}": ${this.reason}`;
	}
}

/** Project sync error (per-project, non-fatal). */
export class ProjectSyncError extends Schema.TaggedError<ProjectSyncError>()("ProjectSyncError", {
	projectNumber: Schema.Number.annotations({
		description: "The project number that failed",
	}),
	operation: NonEmptyString.annotations({
		description: "resolve, link, or backfill",
	}),
	reason: NonEmptyString.annotations({
		description: "Why the operation failed",
	}),
}) {
	get message() {
		return `Project #${this.projectNumber} ${this.operation} failed: ${this.reason}`;
	}
}

// ---------------------------------------------------------------------------
// Error Utilities
// ---------------------------------------------------------------------------

/**
 * Union of all expected errors produced by the action.
 *
 * @remarks
 * Fatal errors ({@link InvalidInputError}, {@link ConfigLoadError},
 * {@link AuthenticationError}, {@link DiscoveryError}) halt the run.
 * Sync errors ({@link LabelSyncError}, {@link SettingsSyncError},
 * {@link ProjectSyncError}) are accumulated per-repo so individual
 * failures do not block other repositories.
 *
 * @public
 */
export type ActionError =
	| InvalidInputError
	| ConfigLoadError
	| AuthenticationError
	| DiscoveryError
	| GitHubApiError
	| GraphQLError
	| LabelSyncError
	| SettingsSyncError
	| ProjectSyncError;
