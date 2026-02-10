import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
	ActionInputs,
	DiscoveredRepo,
	HexColor,
	LabelDefinition,
	LabelResult,
	NonEmptyString,
	ProjectInfo,
	RepoSyncResult,
	RepositorySettings,
	SettingChange,
	SyncErrorRecord,
	decodeSilkConfig,
} from "./index.js";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe("NonEmptyString", () => {
	const decode = Schema.decodeUnknownSync(NonEmptyString);

	it("accepts non-empty strings", () => {
		expect(decode("hello")).toBe("hello");
	});

	it("rejects empty strings", () => {
		expect(() => decode("")).toThrow();
	});
});

describe("HexColor", () => {
	const decode = Schema.decodeUnknownSync(HexColor);

	it("accepts valid 6-digit hex", () => {
		expect(decode("d73a4a")).toBe("d73a4a");
		expect(decode("AABBCC")).toBe("AABBCC");
	});

	it("rejects invalid hex", () => {
		expect(() => decode("gggggg")).toThrow();
		expect(() => decode("#d73a4a")).toThrow();
		expect(() => decode("d73a")).toThrow();
	});
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

describe("LabelDefinition", () => {
	const decode = Schema.decodeUnknownSync(LabelDefinition);

	it("decodes a valid label", () => {
		const label = decode({ name: "bug", description: "Something broken", color: "d73a4a" });
		expect(label.name).toBe("bug");
		expect(label.color).toBe("d73a4a");
	});

	it("rejects label with invalid color", () => {
		expect(() => decode({ name: "bug", description: "x", color: "nope" })).toThrow();
	});

	it("rejects label with empty name", () => {
		expect(() => decode({ name: "", description: "x", color: "d73a4a" })).toThrow();
	});
});

describe("RepositorySettings", () => {
	const decode = Schema.decodeUnknownSync(RepositorySettings);

	it("decodes with all optional fields", () => {
		const settings = decode({});
		expect(settings).toEqual({});
	});

	it("decodes with some fields set", () => {
		const settings = decode({ has_wiki: false, delete_branch_on_merge: true });
		expect(settings.has_wiki).toBe(false);
		expect(settings.delete_branch_on_merge).toBe(true);
	});

	it("rejects invalid squash_merge_commit_title", () => {
		expect(() => decode({ squash_merge_commit_title: "INVALID" })).toThrow();
	});
});

describe("SilkConfig", () => {
	it("decodes a valid config", () => {
		const result = decodeSilkConfig({
			labels: [{ name: "bug", description: "Bug report", color: "d73a4a" }],
			settings: { has_wiki: false },
		});
		expect(result._tag).toBe("Right");
	});

	it("accepts config with $schema field", () => {
		const result = decodeSilkConfig({
			$schema: "./silk.config.schema.json",
			labels: [],
			settings: {},
		});
		expect(result._tag).toBe("Right");
	});

	it("rejects config missing labels", () => {
		const result = decodeSilkConfig({ settings: {} });
		expect(result._tag).toBe("Left");
	});

	it("rejects config missing settings", () => {
		const result = decodeSilkConfig({ labels: [] });
		expect(result._tag).toBe("Left");
	});

	it("rejects config with invalid label color", () => {
		const result = decodeSilkConfig({
			labels: [{ name: "x", description: "y", color: "bad" }],
			settings: {},
		});
		expect(result._tag).toBe("Left");
	});
});

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

describe("DiscoveredRepo", () => {
	const decode = Schema.decodeUnknownSync(DiscoveredRepo);

	it("decodes a valid discovered repo", () => {
		const repo = decode({
			name: "my-repo",
			owner: "my-org",
			fullName: "my-org/my-repo",
			nodeId: "R_abc123",
			customProperties: { workflow: "standard" },
		});
		expect(repo.fullName).toBe("my-org/my-repo");
		expect(repo.customProperties.workflow).toBe("standard");
	});
});

describe("ProjectInfo", () => {
	const decode = Schema.decodeUnknownSync(ProjectInfo);

	it("decodes a valid project", () => {
		const project = decode({ id: "PVT_123", title: "Silk", number: 1, closed: false });
		expect(project.title).toBe("Silk");
	});

	it("rejects non-positive number", () => {
		expect(() => decode({ id: "PVT_123", title: "Silk", number: 0, closed: false })).toThrow();
	});
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

describe("LabelResult", () => {
	const decode = Schema.decodeUnknownSync(LabelResult);

	it("decodes created result", () => {
		const r = decode({ name: "bug", operation: "created" });
		expect(r.operation).toBe("created");
	});

	it("decodes updated result with changes", () => {
		const r = decode({ name: "bug", operation: "updated", changes: ["color: #aaa -> #bbb"] });
		expect(r.changes).toHaveLength(1);
	});

	it("rejects invalid operation", () => {
		expect(() => decode({ name: "bug", operation: "invalid" })).toThrow();
	});
});

describe("SettingChange", () => {
	const decode = Schema.decodeUnknownSync(SettingChange);

	it("decodes with any value types", () => {
		const c = decode({ key: "has_wiki", from: true, to: false });
		expect(c.from).toBe(true);
		expect(c.to).toBe(false);
	});
});

describe("SyncErrorRecord", () => {
	const decode = Schema.decodeUnknownSync(SyncErrorRecord);

	it("decodes a valid error record", () => {
		const e = decode({ target: "bug", operation: "create", error: "Failed" });
		expect(e.target).toBe("bug");
	});
});

describe("RepoSyncResult", () => {
	const decode = Schema.decodeUnknownSync(RepoSyncResult);

	it("decodes a complete result", () => {
		const result = decode({
			repo: "my-repo",
			owner: "org",
			labels: [{ name: "bug", operation: "unchanged" }],
			customLabels: ["stale"],
			settingChanges: [],
			settingsApplied: true,
			projectNumber: null,
			projectTitle: null,
			projectLinkStatus: null,
			itemsAdded: 0,
			itemsAlreadyPresent: 0,
			errors: [],
			success: true,
		});
		expect(result.repo).toBe("my-repo");
		expect(result.labels).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// ActionInputs
// ---------------------------------------------------------------------------

describe("ActionInputs", () => {
	const decode = Schema.decodeUnknownSync(ActionInputs);

	it("decodes valid inputs", () => {
		const inputs = decode({
			appId: "12345",
			appPrivateKey: "-----BEGIN RSA-----",
			configFile: ".github/silk.config.json",
			customProperties: [{ key: "workflow", value: "standard" }],
			repos: [],
			dryRun: false,
			removeCustomLabels: false,
			syncSettings: true,
			syncProjects: true,
			skipBackfill: false,
			logLevel: "info",
			skipTokenRevoke: false,
		});
		expect(inputs.appId).toBe("12345");
		expect(inputs.customProperties).toHaveLength(1);
	});

	it("rejects invalid logLevel", () => {
		expect(() =>
			decode({
				appId: "12345",
				appPrivateKey: "key",
				configFile: "path",
				customProperties: [],
				repos: [],
				dryRun: false,
				removeCustomLabels: false,
				syncSettings: true,
				syncProjects: true,
				skipBackfill: false,
				logLevel: "verbose",
				skipTokenRevoke: false,
			}),
		).toThrow();
	});
});
