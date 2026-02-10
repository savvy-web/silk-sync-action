import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadAndValidateConfig } from "./load.js";

const TEST_DIR = join(tmpdir(), "silk-sync-test-config");

beforeAll(() => {
	if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("loadAndValidateConfig", () => {
	it("loads a valid config file", async () => {
		const path = join(TEST_DIR, "valid.json");
		writeFileSync(
			path,
			JSON.stringify({
				labels: [{ name: "bug", description: "Bug report", color: "d73a4a" }],
				settings: { has_wiki: false },
			}),
		);

		const config = await Effect.runPromise(loadAndValidateConfig(path));
		expect(config.labels).toHaveLength(1);
		expect(config.labels[0].name).toBe("bug");
		expect(config.settings.has_wiki).toBe(false);
	});

	it("accepts config with $schema field", async () => {
		const path = join(TEST_DIR, "with-schema.json");
		writeFileSync(
			path,
			JSON.stringify({
				$schema: "./silk.config.schema.json",
				labels: [],
				settings: {},
			}),
		);

		const config = await Effect.runPromise(loadAndValidateConfig(path));
		expect(config.labels).toEqual([]);
	});

	it("fails on missing file", async () => {
		const path = join(TEST_DIR, "nonexistent.json");
		const exit = await Effect.runPromiseExit(loadAndValidateConfig(path));
		expect(exit._tag).toBe("Failure");
	});

	it("fails on invalid JSON", async () => {
		const path = join(TEST_DIR, "bad.json");
		writeFileSync(path, "{ not valid json }");
		const exit = await Effect.runPromiseExit(loadAndValidateConfig(path));
		expect(exit._tag).toBe("Failure");
	});

	it("fails on schema validation errors", async () => {
		const path = join(TEST_DIR, "invalid-schema.json");
		writeFileSync(
			path,
			JSON.stringify({
				labels: [{ name: "bug", description: "x", color: "not-hex" }],
				settings: {},
			}),
		);
		const exit = await Effect.runPromiseExit(loadAndValidateConfig(path));
		expect(exit._tag).toBe("Failure");
	});

	it("fails when labels field is missing", async () => {
		const path = join(TEST_DIR, "no-labels.json");
		writeFileSync(path, JSON.stringify({ settings: {} }));
		const exit = await Effect.runPromiseExit(loadAndValidateConfig(path));
		expect(exit._tag).toBe("Failure");
	});
});
