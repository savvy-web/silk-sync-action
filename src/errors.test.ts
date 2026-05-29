import { describe, expect, it } from "vitest";
import { DiscoveryError, InvalidInputError } from "./errors.js";

describe("errors", () => {
	it("DiscoveryError has a readable message", () => {
		const e = new DiscoveryError({ reason: "no repos" });
		expect(e.message).toBe("Repository discovery failed: no repos");
	});

	it("InvalidInputError formats field + reason", () => {
		const e = new InvalidInputError({ field: "log-level", value: "loud", reason: "bad" });
		expect(e.message).toBe('Invalid input for "log-level": bad');
	});
});
