import { describe, expect, it } from "vitest";

import {
	AuthenticationError,
	ConfigLoadError,
	DiscoveryError,
	GitHubApiError,
	GraphQLError,
	InvalidInputError,
	LabelSyncError,
	ProjectSyncError,
	SettingsSyncError,
} from "./errors.js";

// ---------------------------------------------------------------------------
// Fatal Errors
// ---------------------------------------------------------------------------

describe("InvalidInputError", () => {
	it("has correct _tag and message", () => {
		const err = new InvalidInputError({ field: "repos", value: "", reason: "must not be empty" });
		expect(err._tag).toBe("InvalidInputError");
		expect(err.message).toContain("repos");
		expect(err.message).toContain("must not be empty");
	});
});

describe("ConfigLoadError", () => {
	it("has correct _tag and message", () => {
		const err = new ConfigLoadError({ path: "/config.json", reason: "File not found" });
		expect(err._tag).toBe("ConfigLoadError");
		expect(err.message).toContain("/config.json");
		expect(err.message).toContain("File not found");
	});
});

describe("AuthenticationError", () => {
	it("includes appId when provided", () => {
		const err = new AuthenticationError({ reason: "JWT expired", appId: "12345" });
		expect(err._tag).toBe("AuthenticationError");
		expect(err.message).toContain("12345");
		expect(err.message).toContain("JWT expired");
	});

	it("works without appId", () => {
		const err = new AuthenticationError({ reason: "Failed" });
		expect(err.message).toContain("Failed");
		expect(err.message).not.toContain("app:");
	});
});

describe("DiscoveryError", () => {
	it("has correct _tag and message", () => {
		const err = new DiscoveryError({ reason: "No repos found" });
		expect(err._tag).toBe("DiscoveryError");
		expect(err.message).toContain("No repos found");
	});
});

// ---------------------------------------------------------------------------
// API Errors
// ---------------------------------------------------------------------------

describe("GitHubApiError", () => {
	it("has correct _tag and message with status code", () => {
		const err = new GitHubApiError({ operation: "listLabels", statusCode: 404, reason: "Not Found" });
		expect(err._tag).toBe("GitHubApiError");
		expect(err.message).toContain("404");
		expect(err.message).toContain("listLabels");
	});

	it("isRateLimited returns true for 429", () => {
		const err = new GitHubApiError({ operation: "x", statusCode: 429, reason: "limit" });
		expect(err.isRateLimited).toBe(true);
		expect(err.isRetryable).toBe(true);
	});

	it("isNotFound returns true for 404", () => {
		const err = new GitHubApiError({ operation: "x", statusCode: 404, reason: "nf" });
		expect(err.isNotFound).toBe(true);
		expect(err.isRetryable).toBe(false);
	});

	it("isValidationFailed returns true for 422", () => {
		const err = new GitHubApiError({ operation: "x", statusCode: 422, reason: "invalid" });
		expect(err.isValidationFailed).toBe(true);
	});

	it("isRetryable returns true for 5xx", () => {
		const err = new GitHubApiError({ operation: "x", statusCode: 503, reason: "unavailable" });
		expect(err.isRetryable).toBe(true);
	});

	it("isRetryable returns false for non-retryable errors", () => {
		const err = new GitHubApiError({ operation: "x", statusCode: 400, reason: "bad" });
		expect(err.isRetryable).toBe(false);
	});

	it("works without statusCode", () => {
		const err = new GitHubApiError({ operation: "x", reason: "network" });
		expect(err.message).toContain("x");
		expect(err.isRateLimited).toBe(false);
		expect(err.isRetryable).toBe(false);
	});
});

describe("GraphQLError", () => {
	it("has correct _tag and message", () => {
		const err = new GraphQLError({ operation: "resolveProject", reason: "not found" });
		expect(err._tag).toBe("GraphQLError");
		expect(err.message).toContain("resolveProject");
	});

	it("isAlreadyExists detects already/exists keywords", () => {
		expect(new GraphQLError({ operation: "x", reason: "item already in project" }).isAlreadyExists).toBe(true);
		expect(new GraphQLError({ operation: "x", reason: "repo exists in list" }).isAlreadyExists).toBe(true);
		expect(new GraphQLError({ operation: "x", reason: "something went wrong" }).isAlreadyExists).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Sync Errors
// ---------------------------------------------------------------------------

describe("LabelSyncError", () => {
	it("has correct _tag and message", () => {
		const err = new LabelSyncError({ label: "bug", operation: "create", reason: "409" });
		expect(err._tag).toBe("LabelSyncError");
		expect(err.message).toContain("bug");
		expect(err.message).toContain("create");
	});
});

describe("SettingsSyncError", () => {
	it("has correct _tag and message", () => {
		const err = new SettingsSyncError({ repo: "my-repo", reason: "422 rejected" });
		expect(err._tag).toBe("SettingsSyncError");
		expect(err.message).toContain("my-repo");
	});
});

describe("ProjectSyncError", () => {
	it("has correct _tag and message", () => {
		const err = new ProjectSyncError({ projectNumber: 1, operation: "link", reason: "Permission denied" });
		expect(err._tag).toBe("ProjectSyncError");
		expect(err.message).toContain("#1");
		expect(err.message).toContain("link");
	});
});
