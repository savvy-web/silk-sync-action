import { ConfigProvider, Effect, Exit, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { parseInputs } from "./inputs.js";

const run = (inputs: Record<string, string>) =>
	parseInputs.pipe(
		Effect.withConfigProvider(ConfigProvider.fromMap(new Map(Object.entries(inputs)))),
		Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
		Effect.runPromiseExit,
	);

describe("parseInputs", () => {
	it("parses defaults with a single discovery method", async () => {
		const exit = await run({ repos: "owner/a\nb" });
		expect(Exit.isSuccess(exit)).toBe(true);
		if (Exit.isSuccess(exit)) {
			expect(exit.value.repos).toEqual(["owner/a", "b"]);
			expect(exit.value.customProperties).toEqual([]);
			expect(exit.value.configFile).toBe(".github/silk.config.json");
			expect(exit.value.dryRun).toBe(false);
			expect(exit.value.syncSettings).toBe(true);
			expect(exit.value.syncProjects).toBe(true);
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

	it("fails when neither repos nor custom-properties is set", async () => {
		const exit = await run({});
		expect(Exit.isFailure(exit)).toBe(true);
	});

	it("fails on malformed custom-properties line", async () => {
		const exit = await run({ "custom-properties": "noequalshere" });
		expect(Exit.isFailure(exit)).toBe(true);
	});
});
