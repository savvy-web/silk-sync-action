import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { GitHubApiError } from "../schemas/errors.js";
import { makeMockRestLayer } from "../test-helpers.js";
import { checkGraphQLRateLimit, checkRestRateLimit, delay } from "./throttle.js";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
	debug: vi.fn(),
	warning: vi.fn(),
	isDebug: () => false,
	getInput: () => "",
}));

describe("delay", () => {
	it("resolves after the specified time", async () => {
		const start = Date.now();
		await Effect.runPromise(delay(10));
		const elapsed = Date.now() - start;
		expect(elapsed).toBeGreaterThanOrEqual(5);
	});
});

describe("checkRestRateLimit", () => {
	it("returns remaining count", async () => {
		const layer = makeMockRestLayer({
			getRateLimit: () =>
				Effect.succeed({
					core: { remaining: 4000, reset: Math.floor(Date.now() / 1000) + 3600 },
					graphql: { remaining: 5000, reset: Math.floor(Date.now() / 1000) + 3600 },
				}),
		});

		const remaining = await Effect.runPromise(checkRestRateLimit().pipe(Effect.provide(layer)));
		expect(remaining).toBe(4000);
	});

	it("returns MAX_SAFE_INTEGER when service is unavailable", async () => {
		// Without providing the layer, the service option is None
		const remaining = await Effect.runPromise(checkRestRateLimit());
		expect(remaining).toBe(Number.MAX_SAFE_INTEGER);
	});

	it("returns MAX_SAFE_INTEGER when API call fails", async () => {
		const layer = makeMockRestLayer({
			getRateLimit: () => Effect.fail(new GitHubApiError({ operation: "rateLimit", reason: "fail" })),
		});

		const remaining = await Effect.runPromise(checkRestRateLimit().pipe(Effect.provide(layer)));
		expect(remaining).toBe(Number.MAX_SAFE_INTEGER);
	});
});

describe("checkGraphQLRateLimit", () => {
	it("returns remaining GraphQL count", async () => {
		const layer = makeMockRestLayer({
			getRateLimit: () =>
				Effect.succeed({
					core: { remaining: 5000, reset: Math.floor(Date.now() / 1000) + 3600 },
					graphql: { remaining: 3000, reset: Math.floor(Date.now() / 1000) + 3600 },
				}),
		});

		const remaining = await Effect.runPromise(checkGraphQLRateLimit().pipe(Effect.provide(layer)));
		expect(remaining).toBe(3000);
	});

	it("returns MAX_SAFE_INTEGER without service", async () => {
		const remaining = await Effect.runPromise(checkGraphQLRateLimit());
		expect(remaining).toBe(Number.MAX_SAFE_INTEGER);
	});
});
