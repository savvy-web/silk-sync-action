import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { parseCustomProperties, parseMultilineInput, parseReposInput } from "./inputs.js";

// ---------------------------------------------------------------------------
// parseMultilineInput
// ---------------------------------------------------------------------------

describe("parseMultilineInput", () => {
	it("splits lines and trims", () => {
		expect(parseMultilineInput("  foo  \n  bar  ")).toEqual(["foo", "bar"]);
	});

	it("filters blank lines", () => {
		expect(parseMultilineInput("foo\n\n\nbar")).toEqual(["foo", "bar"]);
	});

	it("filters comment lines", () => {
		expect(parseMultilineInput("# comment\nfoo\n# another\nbar")).toEqual(["foo", "bar"]);
	});

	it("returns empty array for empty input", () => {
		expect(parseMultilineInput("")).toEqual([]);
		expect(parseMultilineInput("   ")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// parseCustomProperties
// ---------------------------------------------------------------------------

describe("parseCustomProperties", () => {
	it("parses key=value pairs", () => {
		const result = Effect.runSync(parseCustomProperties("workflow=standard\nteam=platform"));
		expect(result).toEqual([
			{ key: "workflow", value: "standard" },
			{ key: "team", value: "platform" },
		]);
	});

	it("handles values with = signs", () => {
		const result = Effect.runSync(parseCustomProperties("key=value=with=equals"));
		expect(result).toEqual([{ key: "key", value: "value=with=equals" }]);
	});

	it("returns empty for blank input", () => {
		const result = Effect.runSync(parseCustomProperties("  "));
		expect(result).toEqual([]);
	});

	it("filters comments and blank lines", () => {
		const result = Effect.runSync(parseCustomProperties("# comment\nworkflow=standard\n\n"));
		expect(result).toEqual([{ key: "workflow", value: "standard" }]);
	});

	it("fails on missing = separator", () => {
		const result = Effect.runSyncExit(parseCustomProperties("no-equals-here"));
		expect(result._tag).toBe("Failure");
	});

	it("fails on empty key", () => {
		const result = Effect.runSyncExit(parseCustomProperties("=value"));
		expect(result._tag).toBe("Failure");
	});

	it("fails on empty value", () => {
		const result = Effect.runSyncExit(parseCustomProperties("key="));
		expect(result._tag).toBe("Failure");
	});
});

// ---------------------------------------------------------------------------
// parseReposInput
// ---------------------------------------------------------------------------

describe("parseReposInput", () => {
	it("parses repo names", () => {
		expect(parseReposInput("repo-a\nrepo-b")).toEqual(["repo-a", "repo-b"]);
	});

	it("supports owner/repo format", () => {
		expect(parseReposInput("org/repo-a")).toEqual(["org/repo-a"]);
	});

	it("returns empty for blank input", () => {
		expect(parseReposInput("")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// parseInputs (requires mocking @actions/core)
// ---------------------------------------------------------------------------

vi.mock("@actions/core", () => {
	const mockInputs: Record<string, string> = {};
	return {
		getInput: (name: string) => mockInputs[name] ?? "",
		__mockInputs: mockInputs,
	};
});

describe("parseInputs", () => {
	it("fails when no discovery method is configured", async () => {
		const core = await import("@actions/core");
		const mockInputs = (core as unknown as { __mockInputs: Record<string, string> }).__mockInputs;
		mockInputs["app-id"] = "12345";
		mockInputs["app-private-key"] = "key";
		mockInputs["config-file"] = "config.json";
		mockInputs["custom-properties"] = "";
		mockInputs.repos = "";
		mockInputs["log-level"] = "info";

		const { parseInputs } = await import("./inputs.js");
		const result = Effect.runSyncExit(parseInputs);
		expect(result._tag).toBe("Failure");
	});
});
