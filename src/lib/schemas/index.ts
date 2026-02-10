import { Schema } from "effect";

// ---------------------------------------------------------------------------
// Primitive Schemas
// ---------------------------------------------------------------------------

/** Non-empty string with validation. */
export const NonEmptyString = Schema.String.pipe(Schema.minLength(1, { message: () => "Value must not be empty" }));

/** Hex color code (6 chars, no # prefix). */
export const HexColor = Schema.String.pipe(
	Schema.pattern(/^[0-9a-fA-F]{6}$/, {
		message: () => "Must be a 6-digit hex color (e.g. 'd73a4a')",
	}),
);

/** Log level. */
export const LogLevel = Schema.Literal("info", "debug");

/** Label sync operation type. */
export const LabelOperation = Schema.Literal("created", "updated", "removed", "unchanged");

/** Project link status. */
export const ProjectLinkStatus = Schema.Literal("linked", "already", "dry-run", "error", "skipped");

/** Squash merge commit title style. */
export const SquashMergeTitle = Schema.Literal("PR_TITLE", "COMMIT_OR_PR_TITLE");

/** Squash merge commit message style. */
export const SquashMergeMessage = Schema.Literal("PR_BODY", "COMMIT_MESSAGES", "BLANK");

// ---------------------------------------------------------------------------
// Action Inputs
// ---------------------------------------------------------------------------

/** Custom property key=value pair for repo discovery. */
export const CustomProperty = Schema.Struct({
	key: NonEmptyString.annotations({
		description: "Custom property name (e.g. 'workflow')",
	}),
	value: NonEmptyString.annotations({
		description: "Expected property value (e.g. 'standard')",
	}),
}).annotations({
	identifier: "CustomProperty",
	title: "Custom Property",
});

export type CustomProperty = typeof CustomProperty.Type;

/** Parsed and validated action inputs. */
export const ActionInputs = Schema.Struct({
	appId: NonEmptyString.annotations({
		identifier: "AppId",
		description: "GitHub App ID for authentication",
	}),
	appPrivateKey: NonEmptyString.annotations({
		identifier: "AppPrivateKey",
		description: "GitHub App private key in PEM format",
	}),
	configFile: NonEmptyString.annotations({
		description: "Path to JSON config file (labels + settings)",
	}),
	customProperties: Schema.Array(CustomProperty).annotations({
		description: "Custom property key=value pairs for discovery (AND logic)",
	}),
	repos: Schema.Array(NonEmptyString).annotations({
		description: "Explicit repo names for discovery",
	}),
	dryRun: Schema.Boolean.annotations({
		description: "Preview changes without applying them",
	}),
	removeCustomLabels: Schema.Boolean.annotations({
		description: "Remove labels not in config defaults",
	}),
	syncSettings: Schema.Boolean.annotations({
		description: "Sync repository settings",
	}),
	syncProjects: Schema.Boolean.annotations({
		description: "Sync project linking and backfill",
	}),
	skipBackfill: Schema.Boolean.annotations({
		description: "Link repos to projects only, skip adding items",
	}),
	logLevel: LogLevel.annotations({
		description: "Logging verbosity (info or debug)",
	}),
	skipTokenRevoke: Schema.Boolean.annotations({
		description: "Skip revoking token in post step",
	}),
}).annotations({
	identifier: "ActionInputs",
	title: "Action Inputs",
	description: "Parsed and validated action inputs from action.yml",
});

export type ActionInputs = typeof ActionInputs.Type;

// ---------------------------------------------------------------------------
// Configuration (user-provided config file)
// ---------------------------------------------------------------------------

/** Label definition from config file. */
export const LabelDefinition = Schema.Struct({
	name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)).annotations({
		description: "Label name (case-insensitive matching)",
	}),
	description: Schema.String.pipe(Schema.maxLength(100)).annotations({
		description: "Short label description",
	}),
	color: HexColor.annotations({
		description: "Hex color without # prefix",
	}),
}).annotations({
	identifier: "LabelDefinition",
	title: "Label Definition",
});

export type LabelDefinition = typeof LabelDefinition.Type;

/** Repository settings (GitHub REST API fields). */
export const RepositorySettings = Schema.Struct({
	has_wiki: Schema.optional(Schema.Boolean),
	has_issues: Schema.optional(Schema.Boolean),
	has_projects: Schema.optional(Schema.Boolean),
	has_discussions: Schema.optional(Schema.Boolean),
	allow_merge_commit: Schema.optional(Schema.Boolean),
	allow_squash_merge: Schema.optional(Schema.Boolean),
	squash_merge_commit_title: Schema.optional(SquashMergeTitle),
	squash_merge_commit_message: Schema.optional(SquashMergeMessage),
	allow_rebase_merge: Schema.optional(Schema.Boolean),
	allow_update_branch: Schema.optional(Schema.Boolean),
	delete_branch_on_merge: Schema.optional(Schema.Boolean),
	web_commit_signoff_required: Schema.optional(Schema.Boolean),
	allow_auto_merge: Schema.optional(Schema.Boolean),
}).annotations({
	identifier: "RepositorySettings",
	title: "Repository Settings",
	description: "Settings applied via GitHub REST API repos.update",
});

export type RepositorySettings = typeof RepositorySettings.Type;

/** Complete sync configuration file. */
export const SilkConfig = Schema.Struct({
	$schema: Schema.optional(Schema.String).annotations({
		description: "Path to the JSON schema file",
	}),
	labels: Schema.Array(LabelDefinition).annotations({
		description: "Labels to sync across repositories",
	}),
	settings: RepositorySettings.annotations({
		description: "Repository settings to enforce",
	}),
}).annotations({
	identifier: "SilkConfig",
	title: "Silk Config",
	description: "Organization-wide sync configuration",
});

export type SilkConfig = typeof SilkConfig.Type;

/** Decode config with Either result. */
export const decodeSilkConfig = Schema.decodeUnknownEither(SilkConfig);

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** Discovered repository with metadata. */
export const DiscoveredRepo = Schema.Struct({
	name: NonEmptyString.annotations({
		description: "Repository name (without owner)",
	}),
	owner: NonEmptyString.annotations({
		description: "Repository owner (org or user)",
	}),
	fullName: NonEmptyString.annotations({
		description: "Full repository name (owner/repo)",
	}),
	nodeId: NonEmptyString.annotations({
		description: "GraphQL node ID for project operations",
	}),
	customProperties: Schema.Record({
		key: Schema.String,
		value: Schema.String,
	}).annotations({
		description: "Custom property values from the org",
	}),
}).annotations({
	identifier: "DiscoveredRepo",
	title: "Discovered Repository",
});

export type DiscoveredRepo = typeof DiscoveredRepo.Type;

/** Resolved GitHub Projects V2 project. */
export const ProjectInfo = Schema.Struct({
	id: NonEmptyString.annotations({
		description: "GraphQL node ID of the project",
	}),
	title: NonEmptyString,
	number: Schema.Number.pipe(Schema.positive()),
	closed: Schema.Boolean,
}).annotations({
	identifier: "ProjectInfo",
	title: "Project Info",
});

export type ProjectInfo = typeof ProjectInfo.Type;

/** GitHub App installation token. */
export const InstallationToken = Schema.Struct({
	token: NonEmptyString.annotations({
		description: "The installation access token",
	}),
	expiresAt: Schema.String.annotations({
		description: "ISO 8601 timestamp when the token expires",
	}),
	installationId: Schema.Number.pipe(Schema.positive()),
	appSlug: Schema.String,
}).annotations({
	identifier: "InstallationToken",
	title: "Installation Token",
	description: "GitHub App installation token with metadata",
});

export type InstallationToken = typeof InstallationToken.Type;

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Result of syncing a single label. */
export const LabelResult = Schema.Struct({
	name: NonEmptyString,
	operation: LabelOperation,
	changes: Schema.optional(Schema.Array(Schema.String)).annotations({
		description: "What changed (e.g. 'color: #aaa -> #bbb')",
	}),
}).annotations({
	identifier: "LabelResult",
	title: "Label Result",
});

export type LabelResult = typeof LabelResult.Type;

/** Single setting diff. */
export const SettingChange = Schema.Struct({
	key: NonEmptyString,
	from: Schema.Unknown,
	to: Schema.Unknown,
}).annotations({
	identifier: "SettingChange",
	title: "Setting Change",
});

export type SettingChange = typeof SettingChange.Type;

/** Per-operation error record for reporting. */
export const SyncErrorRecord = Schema.Struct({
	target: NonEmptyString.annotations({
		description: "What failed (label name, 'settings', project #, etc.)",
	}),
	operation: NonEmptyString.annotations({
		description: "create, update, remove, link, backfill, etc.",
	}),
	error: NonEmptyString.annotations({
		description: "Human-readable error message",
	}),
}).annotations({
	identifier: "SyncErrorRecord",
	title: "Sync Error Record",
});

export type SyncErrorRecord = typeof SyncErrorRecord.Type;

/** Complete result for a single repository sync. */
export const RepoSyncResult = Schema.Struct({
	repo: NonEmptyString,
	owner: NonEmptyString,
	labels: Schema.Array(LabelResult),
	customLabels: Schema.Array(Schema.String).annotations({
		description: "Non-standard labels found in this repo",
	}),
	settingChanges: Schema.Array(SettingChange),
	settingsApplied: Schema.Boolean,
	projectNumber: Schema.NullOr(Schema.Number),
	projectTitle: Schema.NullOr(Schema.String),
	projectLinkStatus: Schema.NullOr(ProjectLinkStatus),
	itemsAdded: Schema.Number,
	itemsAlreadyPresent: Schema.Number,
	errors: Schema.Array(SyncErrorRecord),
	success: Schema.Boolean,
}).annotations({
	identifier: "RepoSyncResult",
	title: "Repo Sync Result",
	description: "Complete result of syncing one repository",
});

export type RepoSyncResult = typeof RepoSyncResult.Type;
