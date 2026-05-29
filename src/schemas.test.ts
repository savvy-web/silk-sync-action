import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ResultsOutput, SilkConfig } from "./schemas.js";

describe("SilkConfig", () => {
	it("decodes a minimal valid config", () => {
		const decoded = Schema.decodeUnknownSync(SilkConfig)({
			labels: [{ name: "bug", description: "A bug", color: "d73a4a" }],
			settings: { has_wiki: false },
		});
		expect(decoded.labels).toHaveLength(1);
		expect(decoded.settings.has_wiki).toBe(false);
	});

	it("rejects an invalid hex color", () => {
		expect(() =>
			Schema.decodeUnknownSync(SilkConfig)({
				labels: [{ name: "bug", description: "", color: "nothex" }],
				settings: {},
			}),
		).toThrow();
	});
});

describe("ResultsOutput", () => {
	it("encodes the results envelope", () => {
		const value = {
			success: true,
			dryRun: false,
			repos: { total: 1, succeeded: 1, failed: 0 },
			labels: { created: 0, updated: 0, removed: 0, unchanged: 1, customCount: 0 },
			settings: { changed: 0, reposWithDrift: 0 },
			projects: { linked: 0, alreadyLinked: 0, itemsAdded: 0, itemsAlreadyPresent: 0 },
			errors: [],
		};
		expect(() => Schema.encodeSync(ResultsOutput)(value)).not.toThrow();
	});
});
