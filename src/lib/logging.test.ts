import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
	debug: vi.fn(),
	isDebug: () => false,
	getInput: vi.fn(() => ""),
}));

describe("logDebug", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("uses debug when not in debug mode", async () => {
		const core = await import("@actions/core");
		vi.mocked(core.getInput).mockReturnValue("info");
		const { logDebug } = await import("./logging.js");

		await Effect.runPromise(logDebug("test message"));
		expect(core.debug).toHaveBeenCalledWith("test message");
	});

	it("uses info with prefix in debug mode", async () => {
		const core = await import("@actions/core");
		vi.mocked(core.getInput).mockReturnValue("debug");
		const { logDebug } = await import("./logging.js");

		await Effect.runPromise(logDebug("test message"));
		expect(core.info).toHaveBeenCalledWith("[DEBUG] test message");
	});
});

describe("logDebugState", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("uses debug when not in debug mode", async () => {
		const core = await import("@actions/core");
		vi.mocked(core.getInput).mockReturnValue("info");
		const { logDebugState } = await import("./logging.js");

		await Effect.runPromise(logDebugState("label", { key: "value" }));
		expect(core.debug).toHaveBeenCalledWith('label: {"key":"value"}');
	});

	it("uses info with prefix in debug mode", async () => {
		const core = await import("@actions/core");
		vi.mocked(core.getInput).mockReturnValue("debug");
		const { logDebugState } = await import("./logging.js");

		await Effect.runPromise(logDebugState("label", { key: "value" }));
		expect(core.info).toHaveBeenCalledWith("[DEBUG] label:");
	});
});
