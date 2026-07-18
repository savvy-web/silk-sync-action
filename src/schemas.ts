import { Schema } from "effect";

export const NonEmptyString = Schema.String.check(Schema.isMinLength(1, { message: "Value must not be empty" }));

export const HexColor = Schema.String.check(
	Schema.isPattern(/^[0-9a-fA-F]{6}$/, { message: "Must be a 6-digit hex color (e.g. 'd73a4a')" }),
);

export const LabelOperation = Schema.Literals(["created", "updated", "removed", "unchanged"]);
export const ProjectLinkStatus = Schema.Literals(["linked", "already", "dry-run", "error", "skipped"]);
export const SquashMergeTitle = Schema.Literals(["PR_TITLE", "COMMIT_OR_PR_TITLE"]);
export const SquashMergeMessage = Schema.Literals(["PR_BODY", "COMMIT_MESSAGES", "BLANK"]);

export const CustomProperty = Schema.Struct({ key: NonEmptyString, value: NonEmptyString });
export type CustomProperty = typeof CustomProperty.Type;

export const LabelDefinition = Schema.Struct({
	name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(50)).annotate({
		description: "Label name (case-insensitive matching)",
	}),
	description: Schema.String.check(Schema.isMaxLength(100)).annotate({
		description: "Short label description",
	}),
	color: HexColor.annotate({
		description: "Hex color without # prefix",
	}),
}).annotate({
	identifier: "LabelDefinition",
	title: "Label Definition",
});
export type LabelDefinition = typeof LabelDefinition.Type;

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
}).annotate({
	identifier: "RepositorySettings",
	title: "Repository Settings",
	description: "Settings applied via GitHub REST API repos.update",
});
export type RepositorySettings = typeof RepositorySettings.Type;

export const SilkConfig = Schema.Struct({
	$schema: Schema.optional(Schema.String).annotate({
		description: "Path to the JSON schema file",
	}),
	labels: Schema.Array(LabelDefinition).annotate({
		description: "Labels to sync across repositories",
	}),
	settings: RepositorySettings.annotate({
		description: "Repository settings to enforce",
	}),
}).annotate({
	identifier: "SilkConfig",
	title: "Silk Config",
	description: "Organization-wide sync configuration",
});
export type SilkConfig = typeof SilkConfig.Type;

export const DiscoveredRepo = Schema.Struct({
	name: NonEmptyString,
	owner: NonEmptyString,
	fullName: NonEmptyString,
	nodeId: NonEmptyString,
	customProperties: Schema.Record(Schema.String, Schema.String),
});
export type DiscoveredRepo = typeof DiscoveredRepo.Type;

export const ProjectInfo = Schema.Struct({
	id: NonEmptyString,
	title: NonEmptyString,
	number: Schema.Number.check(Schema.isGreaterThan(0)),
	closed: Schema.Boolean,
});
export type ProjectInfo = typeof ProjectInfo.Type;

export const LabelResult = Schema.Struct({
	name: NonEmptyString,
	operation: LabelOperation,
	changes: Schema.optional(Schema.Array(Schema.String)),
});
export type LabelResult = typeof LabelResult.Type;

export const SettingChange = Schema.Struct({ key: NonEmptyString, from: Schema.Unknown, to: Schema.Unknown });
export type SettingChange = typeof SettingChange.Type;

export const SyncErrorRecord = Schema.Struct({
	target: NonEmptyString,
	operation: NonEmptyString,
	error: NonEmptyString,
});
export type SyncErrorRecord = typeof SyncErrorRecord.Type;

export const RepoSyncResult = Schema.Struct({
	repo: NonEmptyString,
	owner: NonEmptyString,
	labels: Schema.Array(LabelResult),
	customLabels: Schema.Array(Schema.String),
	settingChanges: Schema.Array(SettingChange),
	settingsApplied: Schema.Boolean,
	projectNumber: Schema.NullOr(Schema.Number),
	projectTitle: Schema.NullOr(Schema.String),
	projectLinkStatus: Schema.NullOr(ProjectLinkStatus),
	itemsAdded: Schema.Number,
	itemsAlreadyPresent: Schema.Number,
	errors: Schema.Array(SyncErrorRecord),
	success: Schema.Boolean,
});
export type RepoSyncResult = typeof RepoSyncResult.Type;

export const ResultsOutput = Schema.Struct({
	success: Schema.Boolean,
	dryRun: Schema.Boolean,
	repos: Schema.Struct({ total: Schema.Number, succeeded: Schema.Number, failed: Schema.Number }),
	labels: Schema.Struct({
		created: Schema.Number,
		updated: Schema.Number,
		removed: Schema.Number,
		unchanged: Schema.Number,
		customCount: Schema.Number,
	}),
	settings: Schema.Struct({ changed: Schema.Number, reposWithDrift: Schema.Number }),
	projects: Schema.Struct({
		linked: Schema.Number,
		alreadyLinked: Schema.Number,
		itemsAdded: Schema.Number,
		itemsAlreadyPresent: Schema.Number,
	}),
	errors: Schema.Array(Schema.Struct({ repo: Schema.String, details: Schema.Array(SyncErrorRecord) })),
});
export type ResultsOutput = typeof ResultsOutput.Type;
