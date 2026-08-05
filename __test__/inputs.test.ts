import { ActionInput } from "@effected/github-actions";
import { Effect, Exit, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { parseInputs } from "../src/inputs.js";

/**
 * Inputs are injected through `ActionInput.layer`, never a bare
 * `ConfigProvider` keyed by the plain input name.
 *
 * @remarks
 * `ActionInput.string("repos")` reads the runner variable `INPUT_REPOS`. A
 * provider keyed by `"repos"` never matches it, so every read falls through to
 * its default and the suite goes green while proving nothing. `ActionInput.layer`
 * dual-accepts input-name keys and owns the mangling.
 */
const run = (inputs: Record<string, string>) =>
	parseInputs.pipe(Effect.provide(ActionInput.layer(inputs)), Effect.provide(Logger.layer([])), Effect.runPromiseExit);

describe("parseInputs", () => {
	it("parses defaults with a single discovery method", async () => {
		const exit = await run({ repos: "owner/a\nb" });
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) {
			expect(exit.value.repos).toEqual(["owner/a", "b"]);
			expect(exit.value.customProperties).toEqual([]);
			expect(exit.value.configFile).toBe(".github/silk.config.json");
			expect(exit.value.dryRun).toBe(false);
			expect(exit.value.removeCustomLabels).toBe(false);
			expect(exit.value.syncSettings).toBe(true);
			expect(exit.value.syncProjects).toBe(true);
			expect(exit.value.skipBackfill).toBe(false);
		}
	});

	it("reads an input spelled the way the runner actually spells it", async () => {
		// The one case that fails if the `INPUT_` derivation is ever bypassed.
		const exit = await run({ [ActionInput.variable("repos")]: "owner/a" });
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) expect(exit.value.repos).toEqual(["owner/a"]);
	});

	it("honors a non-default config-file", async () => {
		const exit = await run({ repos: "a", "config-file": "cfg/silk.json" });
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) expect(exit.value.configFile).toBe("cfg/silk.json");
	});

	it("honors the boolean flags", async () => {
		const exit = await run({
			repos: "a",
			"dry-run": "true",
			"remove-custom-labels": "true",
			"sync-settings": "false",
			"sync-projects": "false",
			"skip-backfill": "true",
		});
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) {
			expect(exit.value.dryRun).toBe(true);
			expect(exit.value.removeCustomLabels).toBe(true);
			expect(exit.value.syncSettings).toBe(false);
			expect(exit.value.syncProjects).toBe(false);
			expect(exit.value.skipBackfill).toBe(true);
		}
	});

	it("parses custom-properties key=value pairs (comments/blanks ignored)", async () => {
		const exit = await run({ "custom-properties": "workflow=standard\n# comment\n\nteam=platform" });
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) {
			expect(exit.value.customProperties).toEqual([
				{ key: "workflow", value: "standard" },
				{ key: "team", value: "platform" },
			]);
		}
	});

	it("splits a custom-property on the first = only", async () => {
		const exit = await run({ "custom-properties": "url=https://x/y=z" });
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) {
			expect(exit.value.customProperties).toEqual([{ key: "url", value: "https://x/y=z" }]);
		}
	});

	it("drops `#` comment lines from repos", async () => {
		const exit = await run({ repos: "a\n# not a repo\nb" });
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) expect(exit.value.repos).toEqual(["a", "b"]);
	});

	/**
	 * `repos` is a documented four-way surface, so each accepted spelling is
	 * pinned here.
	 *
	 * @remarks
	 * The newline case is the one the legacy hand-rolled splitter supported; the
	 * other three are the widening `ActionInput.list` brought, and they are why
	 * `action.yml` advertises more than "one per line". A regression that
	 * narrowed the parser back to newline-only would still pass every other test
	 * in this file.
	 */
	it.each([
		["newlines", "owner/a\nb"],
		["bullets", "- owner/a\n- b"],
		["commas", "owner/a, b"],
		["a JSON array", '["owner/a", "b"]'],
	])("accepts repos as %s", async (_label, raw) => {
		const exit = await run({ repos: raw });
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) expect(exit.value.repos).toEqual(["owner/a", "b"]);
	});

	it("fails when neither repos nor custom-properties is set", async () => {
		const exit = await run({});
		expect(Exit.isFailure(exit)).toBe(true);
	});

	it("fails on a malformed custom-properties line", async () => {
		const exit = await run({ "custom-properties": "noequalshere" });
		expect(Exit.isFailure(exit)).toBe(true);
	});

	it("fails on a custom-property with an empty key", async () => {
		const exit = await run({ "custom-properties": "=standard" });
		expect(Exit.isFailure(exit)).toBe(true);
	});

	it("fails on a custom-property with an empty value", async () => {
		const exit = await run({ "custom-properties": "workflow=" });
		expect(Exit.isFailure(exit)).toBe(true);
	});
});
