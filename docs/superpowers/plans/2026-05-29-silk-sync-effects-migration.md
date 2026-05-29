# Silk Sync Action — Effect Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `@savvy-web/silk-sync-action` on `@savvy-web/github-action-effects` v2, deleting all hand-rolled GitHub/auth/state/throttle infrastructure, and cut it to a stable 1.0.0.

**Architecture:** Three-phase action (`pre`/`main`/`post`). `pre` provisions a GitHub App installation token via `GitHubToken.provision`; `main` discovers org repos and syncs labels/settings/Projects-v2 sequentially using the library's resilient `GitHubClient` + `GitHubGraphQL`; `post` revokes the token via `GitHubToken.dispose`. Domain functions are pure-ish Effects that require `GitHubClient`/`GitHubGraphQL` and return result records; per-repo errors are accumulated, never fatal.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Effect 3.x, `@savvy-web/github-action-effects` ^2.0.1, `@effect/platform-node`, Vitest, Biome, `@savvy-web/github-action-builder` (ncc bundling).

**Spec:** `docs/superpowers/specs/2026-05-29-silk-sync-effects-migration-design.md`
**Library reference (source of truth for signatures):** `/Users/spencer/workspaces/savvy-web/github-action-effects` and sister actions `../silk-release-action`, `../pnpm-config-dependency-action`.

---

## Conventions used throughout this plan

- All relative imports use `.js` extensions (ESM). Type-only imports use `import type`.
- Test files are colocated as `*.test.ts`. Run a single file with `pnpm vitest run <path>`.
- Commits use Conventional Commits + DCO signoff. Every commit body ends with:
  `Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>`
- The pre-commit hook runs Biome + markdownlint + (on push) tests. Keep code lint-clean.
- **`GitHubClientTest` keys canned REST responses by the `operation` string** passed to `client.rest(op, …)` / `client.paginate(op, …)`, and GraphQL by the exact query string. **`GitHubGraphQLTest` keys by the `operation` name** and records `queryCalls`/`mutationCalls`. We therefore use stable, explicit operation names everywhere (listed per task) so tests can seed them.

---

## File structure (created/deleted)

**Created under `src/`:**

```text
src/
  pre.ts                      # Action.run(pre,     { layer: PreLive })
  main.ts                     # Action.run(program, { layer: MainLive })
  post.ts                     # Action.run(post,    { layer: PostLive })
  program.ts                  # main Effect program
  inputs.ts                   # Config/ActionInput parsing → SilkInputs
  state.ts                    # ActionState Schema.Class structs
  layers/app.ts               # PreLive, MainLive, PostLive
  errors.ts                   # DiscoveryError, InvalidInputError (TaggedError)
  schemas.ts                  # SilkConfig + domain + ResultsOutput schemas
  github/reads.ts             # thin GitHubClient REST wrappers (operation names)
  discovery/customProperties.ts
  discovery/explicit.ts
  discovery/index.ts          # merge + dedupe
  sync/labels.ts
  sync/settings.ts
  sync/projects.ts
  sync/syncRepo.ts            # per-repo orchestration
  sync/processRepos.ts        # sequential iteration + stats
  reporting/stats.ts          # aggregateStats + SyncStats
  reporting/summary.ts        # step-summary markdown via ReportBuilder/GithubMarkdown
lib/scripts/generate-schema.ts  # KEEP (update import path to ../../src/schemas.js)
```

**Deleted (entire `src/lib/` tree):** `lib/github/auth.ts`, `lib/services/*`, `lib/rate-limit/*`, `lib/config/load.ts`, `lib/logging.ts`, `lib/inputs.ts`, `lib/discovery/*`, `lib/sync/*`, `lib/reporting/*`, `lib/schemas/*`, `lib/test-helpers.ts`, and their tests. (Done in Task 18 after the new tree is green.)

---

## Task 1: Dependencies and project wiring

**Files:**

- Modify: `package.json`
- Modify: `lib/scripts/generate-schema.ts` (import path only)

- [ ] **Step 1: Update `package.json` dependencies**

Replace the `dependencies` block with library-only runtime deps and align Effect to the workspace catalog (mirror `../silk-router-action/package.json`):

```jsonc
"dependencies": {
  "@effect/platform": "catalog:silk",
  "@effect/platform-node": "catalog:silk",
  "@savvy-web/github-action-effects": "^2.0.1",
  "effect": "catalog:silk"
}
```

Remove `@actions/core`, `@actions/github`, `@octokit/auth-app`, `@octokit/request`, `@octokit/rest`. Leave `devDependencies`, `scripts`, `packageManager`, and `devEngines` unchanged.

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, no errors. (`catalog:silk` resolves from the workspace `pnpm-workspace.yaml`; if it errors that the catalog is missing, copy the exact Effect versions from `../silk-router-action/package.json` instead of `catalog:silk`.)

- [ ] **Step 3: Point schema generator at the new schema module**

In `lib/scripts/generate-schema.ts`, change the import of the `SilkConfig` schema to the new location `../../src/schemas.js` (created in Task 2). Leave the rest of the generator untouched. (It currently imports from `../../src/lib/schemas/index.js`.)

- [ ] **Step 4: Verify typecheck baseline fails cleanly**

Run: `pnpm run typecheck`
Expected: FAILS — `src/lib/**` still references removed `@actions/*`/`@octokit/*` packages. This is expected; the old tree is removed in Task 18. Proceed.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml lib/scripts/generate-schema.ts
git commit -m "chore(deps): swap @actions/@octokit deps for github-action-effects

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 2: Domain schemas

**Files:**

- Create: `src/schemas.ts`
- Test: `src/schemas.test.ts`

Port the still-needed schemas from `src/lib/schemas/index.ts` (drop `ActionInputs` — replaced by `inputs.ts`; drop `InstallationToken` — owned by the library) and add `ResultsOutput`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/schemas.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/schemas.test.ts`
Expected: FAIL — `Cannot find module './schemas.js'`.

- [ ] **Step 3: Write `src/schemas.ts`**

```typescript
import { Schema } from "effect";

export const NonEmptyString = Schema.String.pipe(Schema.minLength(1, { message: () => "Value must not be empty" }));

export const HexColor = Schema.String.pipe(
  Schema.pattern(/^[0-9a-fA-F]{6}$/, { message: () => "Must be a 6-digit hex color (e.g. 'd73a4a')" }),
);

export const LabelOperation = Schema.Literal("created", "updated", "removed", "unchanged");
export const ProjectLinkStatus = Schema.Literal("linked", "already", "dry-run", "error", "skipped");
export const SquashMergeTitle = Schema.Literal("PR_TITLE", "COMMIT_OR_PR_TITLE");
export const SquashMergeMessage = Schema.Literal("PR_BODY", "COMMIT_MESSAGES", "BLANK");

export const CustomProperty = Schema.Struct({ key: NonEmptyString, value: NonEmptyString });
export type CustomProperty = typeof CustomProperty.Type;

export const LabelDefinition = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
  description: Schema.String.pipe(Schema.maxLength(100)),
  color: HexColor,
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
});
export type RepositorySettings = typeof RepositorySettings.Type;

export const SilkConfig = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  labels: Schema.Array(LabelDefinition),
  settings: RepositorySettings,
});
export type SilkConfig = typeof SilkConfig.Type;

export const DiscoveredRepo = Schema.Struct({
  name: NonEmptyString,
  owner: NonEmptyString,
  fullName: NonEmptyString,
  nodeId: NonEmptyString,
  customProperties: Schema.Record({ key: Schema.String, value: Schema.String }),
});
export type DiscoveredRepo = typeof DiscoveredRepo.Type;

export const ProjectInfo = Schema.Struct({
  id: NonEmptyString,
  title: NonEmptyString,
  number: Schema.Number.pipe(Schema.positive()),
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

// Action output envelope (was the `results` JSON in the old action).
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/schemas.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/schemas.ts src/schemas.test.ts
git commit -m "feat: add domain schemas for Effect rewrite

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 3: Error types and state structs

**Files:**

- Create: `src/errors.ts`
- Create: `src/state.ts`
- Test: `src/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/errors.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/errors.test.ts`
Expected: FAIL — `Cannot find module './errors.js'`.

- [ ] **Step 3: Write `src/errors.ts`**

```typescript
import { Schema } from "effect";
import { NonEmptyString } from "./schemas.js";

export class InvalidInputError extends Schema.TaggedError<InvalidInputError>()("InvalidInputError", {
  field: NonEmptyString,
  value: Schema.Unknown,
  reason: NonEmptyString,
}) {
  get message(): string {
    return `Invalid input for "${this.field}": ${this.reason}`;
  }
}

export class DiscoveryError extends Schema.TaggedError<DiscoveryError>()("DiscoveryError", {
  reason: NonEmptyString,
}) {
  get message(): string {
    return `Repository discovery failed: ${this.reason}`;
  }
}
```

- [ ] **Step 4: Write `src/state.ts`**

```typescript
import { Schema } from "effect";

/** Wall-clock start time persisted in `pre`, read in `post` for duration logging. */
export class StartTimeState extends Schema.Class<StartTimeState>("StartTimeState")({
  startedAt: Schema.Number,
}) {}

export const STATE_KEYS = {
  startTime: "startTime",
} as const;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/errors.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/errors.ts src/state.ts src/errors.test.ts
git commit -m "feat: add tagged errors and action-state structs

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 4: Input parsing

**Files:**

- Create: `src/inputs.ts`
- Test: `src/inputs.test.ts`

`SilkInputs` excludes the App credentials (those are read by `GitHubToken.provision` directly) and excludes `appId`/`logLevel`/`skipTokenRevoke` (dropped per spec). It keeps `configFile`, `customProperties`, `repos`, and the boolean flags. The `custom-properties` `key=value` parsing + the "at least one discovery method" validation are preserved.

- [ ] **Step 1: Write the failing test**

```typescript
// src/inputs.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/inputs.test.ts`
Expected: FAIL — `Cannot find module './inputs.js'`.

- [ ] **Step 3: Write `src/inputs.ts`**

```typescript
import { ActionInput } from "@savvy-web/github-action-effects";
import { Config, Effect } from "effect";
import { InvalidInputError } from "./errors.js";
import type { CustomProperty } from "./schemas.js";

export interface SilkInputs {
  readonly configFile: string;
  readonly customProperties: ReadonlyArray<CustomProperty>;
  readonly repos: ReadonlyArray<string>;
  readonly dryRun: boolean;
  readonly removeCustomLabels: boolean;
  readonly syncSettings: boolean;
  readonly syncProjects: boolean;
  readonly skipBackfill: boolean;
}

/** Strip blank lines and `#` comments from already-split multiline input. */
const stripComments = (lines: ReadonlyArray<string>): ReadonlyArray<string> =>
  lines.map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));

const parseCustomProperties = (
  lines: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<CustomProperty>, InvalidInputError> =>
  Effect.gen(function* () {
    const out: Array<CustomProperty> = [];
    for (const line of stripComments(lines)) {
      const eq = line.indexOf("=");
      if (eq === -1) {
        return yield* Effect.fail(
          new InvalidInputError({ field: "custom-properties", value: line, reason: `Expected "key=value", got "${line}"` }),
        );
      }
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!key) {
        return yield* Effect.fail(
          new InvalidInputError({ field: "custom-properties", value: line, reason: "Property key must not be empty" }),
        );
      }
      if (!value) {
        return yield* Effect.fail(
          new InvalidInputError({ field: "custom-properties", value: line, reason: `Value for "${key}" must not be empty` }),
        );
      }
      out.push({ key, value });
    }
    return out;
  });

export const parseInputs: Effect.Effect<SilkInputs, InvalidInputError> = Effect.gen(function* () {
  const configFile = yield* Config.string("config-file").pipe(Config.withDefault(".github/silk.config.json"));
  const rawProps = yield* ActionInput.multiline("custom-properties").pipe(Config.withDefault([]));
  const customProperties = yield* parseCustomProperties(rawProps);
  const repos = stripComments(yield* ActionInput.multiline("repos").pipe(Config.withDefault([])));

  if (customProperties.length === 0 && repos.length === 0) {
    return yield* Effect.fail(
      new InvalidInputError({
        field: "repos / custom-properties",
        value: undefined,
        reason: "At least one discovery method must be configured: provide 'repos' and/or 'custom-properties'",
      }),
    );
  }

  const dryRun = yield* ActionInput.boolean("dry-run").pipe(Config.withDefault(false));
  const removeCustomLabels = yield* ActionInput.boolean("remove-custom-labels").pipe(Config.withDefault(false));
  const syncSettings = yield* ActionInput.boolean("sync-settings").pipe(Config.withDefault(true));
  const syncProjects = yield* ActionInput.boolean("sync-projects").pipe(Config.withDefault(true));
  const skipBackfill = yield* ActionInput.boolean("skip-backfill").pipe(Config.withDefault(false));

  return { configFile, customProperties, repos: [...repos], dryRun, removeCustomLabels, syncSettings, syncProjects, skipBackfill };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/inputs.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/inputs.ts src/inputs.test.ts
git commit -m "feat: parse inputs via Config/ActionInput

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 5: GitHub REST read wrappers

**Files:**

- Create: `src/github/reads.ts`
- Test: `src/github/reads.test.ts`

Thin, typed wrappers over `GitHubClient` so the rest of the code (and tests) use stable operation names. These return library `GitHubClientError` on failure.

Operation-name keys (used by `GitHubClientTest`): `repos.get`, `issues.listLabelsForRepo`, `issues.createLabel`, `issues.updateLabel`, `issues.deleteLabel`, `repos.update`, `issues.listForRepo`, `orgs.listCustomPropertiesValues`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/github/reads.test.ts
import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { getRepo, listLabels } from "./reads.js";

describe("github reads", () => {
  it("getRepo returns repo data keyed by 'repos.get'", async () => {
    const layer = GitHubClientTest.layer({
      restResponses: new Map([["repos.get", { data: { node_id: "n1", name: "r", full_name: "o/r", owner: { login: "o" } } }]]),
      graphqlResponses: new Map(),
      paginateResponses: new Map(),
      repo: { owner: "o", repo: "r" },
    });
    const data = await getRepo("o", "r").pipe(Effect.provide(layer), Effect.runPromise);
    expect(data.full_name).toBe("o/r");
  });

  it("listLabels collects paginated labels keyed by 'issues.listLabelsForRepo'", async () => {
    const layer = GitHubClientTest.layer({
      restResponses: new Map(),
      graphqlResponses: new Map(),
      paginateResponses: new Map([["issues.listLabelsForRepo", [[{ id: 1, name: "bug", description: "", color: "d73a4a" }]]]]),
      repo: { owner: "o", repo: "r" },
    });
    const labels = await listLabels("o", "r").pipe(Effect.provide(layer), Effect.runPromise);
    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe("bug");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/github/reads.test.ts`
Expected: FAIL — `Cannot find module './reads.js'`.

- [ ] **Step 3: Write `src/github/reads.ts`**

```typescript
import { GitHubClient, type GitHubClientError } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import type { LabelDefinition } from "../schemas.js";

export interface GitHubRepo {
  readonly node_id: string;
  readonly name: string;
  readonly full_name: string;
  readonly owner: { readonly login: string };
  readonly has_wiki: boolean;
  readonly has_issues: boolean;
  readonly has_projects: boolean;
  readonly has_discussions: boolean;
  readonly allow_merge_commit: boolean;
  readonly allow_squash_merge: boolean;
  readonly squash_merge_commit_title: string;
  readonly squash_merge_commit_message: string;
  readonly allow_rebase_merge: boolean;
  readonly allow_update_branch: boolean;
  readonly delete_branch_on_merge: boolean;
  readonly web_commit_signoff_required: boolean;
  readonly allow_auto_merge: boolean;
}

export interface GitHubLabel {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly color: string;
}

export interface GitHubIssue {
  readonly id: number;
  readonly node_id: string;
  readonly number: number;
  readonly title: string;
  readonly pull_request?: unknown;
}

export interface OrgRepoProperty {
  readonly repository_id: number;
  readonly repository_name: string;
  readonly repository_full_name: string;
  readonly repository_node_id: string;
  readonly properties: ReadonlyArray<{ readonly property_name: string; readonly value: string | null }>;
}

// Minimal structural casts at the octokit wire boundary (octokit's typed surface
// is reached via `as`; the custom-properties endpoint is the documented typing gap).
type RestOctokit = { rest: { repos: { get: (p: unknown) => Promise<{ data: GitHubRepo }>; update: (p: unknown) => Promise<{ data: unknown }> }; issues: Record<string, (p: unknown) => Promise<{ data: unknown }>> } };
type RequestOctokit = { request: (route: string, p: unknown) => Promise<{ data: unknown }> };

export const getRepo = (owner: string, repo: string): Effect.Effect<GitHubRepo, GitHubClientError, GitHubClient> =>
  Effect.flatMap(GitHubClient, (gh) =>
    gh.rest("repos.get", (octokit) => (octokit as RestOctokit).rest.repos.get({ owner, repo })),
  );

export const listLabels = (owner: string, repo: string): Effect.Effect<ReadonlyArray<GitHubLabel>, GitHubClientError, GitHubClient> =>
  Effect.flatMap(GitHubClient, (gh) =>
    gh.paginate<GitHubLabel>("issues.listLabelsForRepo", (octokit, page, perPage) =>
      (octokit as unknown as { rest: { issues: { listLabelsForRepo: (p: unknown) => Promise<{ data: GitHubLabel[] }> } } }).rest.issues.listLabelsForRepo({ owner, repo, per_page: perPage, page }),
    ),
  );

export const createLabel = (owner: string, repo: string, label: LabelDefinition): Effect.Effect<void, GitHubClientError, GitHubClient> =>
  Effect.flatMap(GitHubClient, (gh) =>
    gh.rest("issues.createLabel", (octokit) =>
      (octokit as RestOctokit).rest.issues.createLabel({ owner, repo, name: label.name, description: label.description, color: label.color }),
    ).pipe(Effect.asVoid),
  );

export const updateLabel = (owner: string, repo: string, currentName: string, label: LabelDefinition): Effect.Effect<void, GitHubClientError, GitHubClient> =>
  Effect.flatMap(GitHubClient, (gh) =>
    gh.rest("issues.updateLabel", (octokit) =>
      (octokit as RestOctokit).rest.issues.updateLabel({ owner, repo, name: currentName, new_name: label.name, description: label.description, color: label.color }),
    ).pipe(Effect.asVoid),
  );

export const deleteLabel = (owner: string, repo: string, name: string): Effect.Effect<void, GitHubClientError, GitHubClient> =>
  Effect.flatMap(GitHubClient, (gh) =>
    gh.rest("issues.deleteLabel", (octokit) => (octokit as RestOctokit).rest.issues.deleteLabel({ owner, repo, name })).pipe(Effect.asVoid),
  );

export const updateRepo = (owner: string, repo: string, settings: Record<string, unknown>): Effect.Effect<void, GitHubClientError, GitHubClient> =>
  Effect.flatMap(GitHubClient, (gh) =>
    gh.rest("repos.update", (octokit) => (octokit as RestOctokit).rest.repos.update({ owner, repo, ...settings })).pipe(Effect.asVoid),
  );

export const listOpenIssues = (owner: string, repo: string): Effect.Effect<ReadonlyArray<GitHubIssue>, GitHubClientError, GitHubClient> =>
  Effect.flatMap(GitHubClient, (gh) =>
    gh.paginate<GitHubIssue>("issues.listForRepo", (octokit, page, perPage) =>
      (octokit as unknown as { rest: { issues: { listForRepo: (p: unknown) => Promise<{ data: GitHubIssue[] }> } } }).rest.issues.listForRepo({ owner, repo, state: "open", per_page: perPage, page }),
    ),
  );

export const listOrgRepoProperties = (org: string): Effect.Effect<ReadonlyArray<OrgRepoProperty>, GitHubClientError, GitHubClient> =>
  Effect.flatMap(GitHubClient, (gh) =>
    gh
      .paginate<{ repository_id: number; repository_name: string; repository_full_name: string; repository_node_id?: string; properties: Array<{ property_name: string; value: unknown }> }>(
        "orgs.listCustomPropertiesValues",
        (octokit, page, perPage) => (octokit as RequestOctokit).request("GET /orgs/{org}/properties/values", { org, per_page: perPage, page }) as Promise<{ data: Array<{ repository_id: number; repository_name: string; repository_full_name: string; repository_node_id?: string; properties: Array<{ property_name: string; value: unknown }> }> }>,
      )
      .pipe(
        Effect.map((rows) =>
          rows.map((r) => ({
            repository_id: r.repository_id,
            repository_name: r.repository_name,
            repository_full_name: r.repository_full_name,
            repository_node_id: r.repository_node_id ?? "",
            properties: r.properties.map((p) => ({ property_name: p.property_name, value: typeof p.value === "string" ? p.value : null })),
          })),
        ),
      ),
  );
```

> Note: `Effect.asVoid` discards the success value. If your Effect version names it `Effect.ignore`-free differently, use `Effect.map(() => undefined)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/github/reads.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/github/reads.ts src/github/reads.test.ts
git commit -m "feat: add typed GitHubClient read/write wrappers

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 6: Discovery — custom properties

**Files:**

- Create: `src/discovery/customProperties.ts`
- Test: `src/discovery/customProperties.test.ts`

Preserve behavior: fetch all org repo property rows, AND-match the configured filters (case-insensitive), map matches to `DiscoveredRepo` (owner = org, customProperties = string-valued props).

- [ ] **Step 1: Write the failing test**

```typescript
// src/discovery/customProperties.test.ts
import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { discoverByCustomProperties } from "./customProperties.js";

const layerWith = (rows: unknown[]) =>
  GitHubClientTest.layer({
    restResponses: new Map(),
    graphqlResponses: new Map(),
    paginateResponses: new Map([["orgs.listCustomPropertiesValues", [rows]]]),
    repo: { owner: "acme", repo: "x" },
  });

const run = (rows: unknown[], filters: { key: string; value: string }[]) =>
  discoverByCustomProperties("acme", filters).pipe(
    Effect.provide(layerWith(rows)),
    Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
    Effect.runPromise,
  );

describe("discoverByCustomProperties", () => {
  it("matches repos satisfying ALL filters (case-insensitive)", async () => {
    const rows = [
      { repository_id: 1, repository_name: "a", repository_full_name: "acme/a", repository_node_id: "na", properties: [{ property_name: "workflow", value: "Standard" }] },
      { repository_id: 2, repository_name: "b", repository_full_name: "acme/b", repository_node_id: "nb", properties: [{ property_name: "workflow", value: "other" }] },
    ];
    const result = await run(rows, [{ key: "workflow", value: "standard" }]);
    expect(result.map((r) => r.name)).toEqual(["a"]);
    expect(result[0].customProperties).toEqual({ workflow: "Standard" });
  });

  it("returns [] when no filters provided", async () => {
    const result = await run([], []);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/discovery/customProperties.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/discovery/customProperties.ts`**

```typescript
import type { GitHubClient } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { DiscoveryError } from "../errors.js";
import { listOrgRepoProperties } from "../github/reads.js";
import type { CustomProperty, DiscoveredRepo } from "../schemas.js";

export const discoverByCustomProperties = (
  org: string,
  properties: ReadonlyArray<CustomProperty>,
): Effect.Effect<ReadonlyArray<DiscoveredRepo>, DiscoveryError, GitHubClient> =>
  Effect.gen(function* () {
    if (properties.length === 0) return [];

    const rows = yield* listOrgRepoProperties(org).pipe(
      Effect.mapError((e) => new DiscoveryError({ reason: `Failed to query org custom properties: ${e.reason}` })),
    );

    const matched = rows.filter((row) => {
      const map = new Map(row.properties.map((p) => [p.property_name.toLowerCase(), (p.value ?? "").toLowerCase()]));
      return properties.every((f) => map.get(f.key.toLowerCase()) === f.value.toLowerCase());
    });

    yield* Effect.logDebug(`${matched.length}/${rows.length} repos match all custom-property filters in "${org}"`);

    return matched.map((row) => {
      const propsMap: Record<string, string> = {};
      for (const p of row.properties) if (p.value != null) propsMap[p.property_name] = p.value;
      return {
        name: row.repository_name,
        owner: org,
        fullName: row.repository_full_name,
        nodeId: row.repository_node_id,
        customProperties: propsMap,
      } satisfies DiscoveredRepo;
    });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/discovery/customProperties.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/discovery/customProperties.ts src/discovery/customProperties.test.ts
git commit -m "feat(discovery): match org repos by custom properties

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 7: Discovery — explicit list

**Files:**

- Create: `src/discovery/explicit.ts`
- Test: `src/discovery/explicit.test.ts`

Preserve behavior: each name resolves via `repos.get`; `owner/repo` or bare name (default owner = org); a not-found/failed repo is skipped; if *all* specified repos fail, the whole discovery fails with `DiscoveryError`.

> Test note: `GitHubClientTest` keys by operation name only, so it returns the **same** canned `repos.get` data for every name. To test the multi-name + failure path, this task's domain code is written to accept a per-call client through `GitHubClient`, and the test seeds a single repo and asserts mapping; the all-fail path is covered by seeding **no** `repos.get` response (every call returns the recorded-404 error) and asserting `DiscoveryError`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/discovery/explicit.test.ts
import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Exit, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { discoverByExplicitList } from "./explicit.js";

const run = (repoResponse: unknown | undefined, names: string[]) => {
  const restResponses = new Map<string, { data: unknown }>();
  if (repoResponse !== undefined) restResponses.set("repos.get", { data: repoResponse });
  const layer = GitHubClientTest.layer({ restResponses, graphqlResponses: new Map(), paginateResponses: new Map(), repo: { owner: "acme", repo: "x" } });
  return discoverByExplicitList("acme", names).pipe(
    Effect.provide(layer),
    Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
    Effect.runPromiseExit,
  );
};

describe("discoverByExplicitList", () => {
  it("maps a resolved repo to DiscoveredRepo with empty customProperties", async () => {
    const exit = await run({ node_id: "n1", name: "a", full_name: "acme/a", owner: { login: "acme" } }, ["a"]);
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual([{ name: "a", owner: "acme", fullName: "acme/a", nodeId: "n1", customProperties: {} }]);
    }
  });

  it("fails with DiscoveryError when every repo fails to resolve", async () => {
    const exit = await run(undefined, ["a", "b"]);
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("returns [] for an empty name list", async () => {
    const exit = await run(undefined, []);
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/discovery/explicit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/discovery/explicit.ts`**

```typescript
import type { GitHubClient } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { DiscoveryError } from "../errors.js";
import { getRepo } from "../github/reads.js";
import type { DiscoveredRepo } from "../schemas.js";

export const discoverByExplicitList = (
  defaultOwner: string,
  repoNames: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<DiscoveredRepo>, DiscoveryError, GitHubClient> =>
  Effect.gen(function* () {
    if (repoNames.length === 0) return [];

    const discovered: Array<DiscoveredRepo> = [];
    const errors: Array<string> = [];

    for (const raw of repoNames) {
      const [owner, repo] = raw.includes("/") ? (raw.split("/", 2) as [string, string]) : [defaultOwner, raw];
      const result = yield* getRepo(owner, repo).pipe(
        Effect.map(
          (data) =>
            ({ name: data.name, owner: data.owner.login, fullName: data.full_name, nodeId: data.node_id, customProperties: {} }) satisfies DiscoveredRepo,
        ),
        Effect.catchAll((e) => {
          errors.push(`${owner}/${repo} (${e.reason})`);
          return Effect.succeed(null);
        }),
      );
      if (result) discovered.push(result);
    }

    if (discovered.length === 0 && errors.length > 0) {
      return yield* Effect.fail(new DiscoveryError({ reason: `None of the specified repos could be validated: ${errors.join(", ")}` }));
    }

    yield* Effect.logDebug(`Validated ${discovered.length} explicit repos`);
    return discovered;
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/discovery/explicit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/discovery/explicit.ts src/discovery/explicit.test.ts
git commit -m "feat(discovery): resolve explicit repo list

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 8: Discovery — merge and dedupe

**Files:**

- Create: `src/discovery/index.ts`
- Test: `src/discovery/index.test.ts`

Preserve union semantics: dedupe by lowercased `fullName`; on conflict, org-discovery custom properties win.

- [ ] **Step 1: Write the failing test**

```typescript
// src/discovery/index.test.ts
import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Exit, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { discoverRepos } from "./index.js";

const run = (opts: { customProperties: { key: string; value: string }[]; repos: string[] }) => {
  const layer = GitHubClientTest.layer({
    restResponses: new Map([["repos.get", { data: { node_id: "ne", name: "a", full_name: "acme/a", owner: { login: "acme" } } }]]),
    graphqlResponses: new Map(),
    paginateResponses: new Map([
      ["orgs.listCustomPropertiesValues", [[{ repository_id: 1, repository_name: "a", repository_full_name: "acme/a", repository_node_id: "na", properties: [{ property_name: "workflow", value: "standard" }] }]]],
    ]),
    repo: { owner: "acme", repo: "a" },
  });
  return discoverRepos("acme", opts).pipe(
    Effect.provide(layer),
    Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
    Effect.runPromiseExit,
  );
};

describe("discoverRepos", () => {
  it("dedupes by fullName and keeps org custom properties on conflict", async () => {
    const exit = await run({ customProperties: [{ key: "workflow", value: "standard" }], repos: ["a"] });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toHaveLength(1);
      expect(exit.value[0].customProperties).toEqual({ workflow: "standard" });
    }
  });

  it("fails when zero repos discovered", async () => {
    const exit = await run({ customProperties: [], repos: [] });
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/discovery/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/discovery/index.ts`**

```typescript
import type { GitHubClient } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { DiscoveryError } from "../errors.js";
import type { CustomProperty, DiscoveredRepo } from "../schemas.js";
import { discoverByCustomProperties } from "./customProperties.js";
import { discoverByExplicitList } from "./explicit.js";

export const discoverRepos = (
  org: string,
  opts: { readonly customProperties: ReadonlyArray<CustomProperty>; readonly repos: ReadonlyArray<string> },
): Effect.Effect<ReadonlyArray<DiscoveredRepo>, DiscoveryError, GitHubClient> =>
  Effect.gen(function* () {
    const orgRepos = opts.customProperties.length > 0 ? yield* discoverByCustomProperties(org, opts.customProperties) : [];
    const explicitRepos = opts.repos.length > 0 ? yield* discoverByExplicitList(org, opts.repos) : [];

    const map = new Map<string, DiscoveredRepo>();
    for (const repo of orgRepos) map.set(repo.fullName.toLowerCase(), repo);
    for (const repo of explicitRepos) {
      const key = repo.fullName.toLowerCase();
      const existing = map.get(key);
      if (!existing) map.set(key, repo);
      else map.set(key, { ...repo, customProperties: { ...repo.customProperties, ...existing.customProperties } });
    }

    const all = [...map.values()];
    if (all.length === 0) {
      return yield* Effect.fail(new DiscoveryError({ reason: "No repositories discovered. Check your 'custom-properties' and/or 'repos' inputs." }));
    }

    yield* Effect.logInfo(`Discovered ${all.length} repositories`);
    for (const r of all) yield* Effect.logDebug(`  - ${r.fullName}`);
    return all;
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/discovery/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/discovery/index.ts src/discovery/index.test.ts
git commit -m "feat(discovery): merge and dedupe discovered repos

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 9: Sync labels

**Files:**

- Create: `src/sync/labels.ts`
- Test: `src/sync/labels.test.ts`

Preserve the diff logic exactly (case-insensitive name match; update when color/description/casing differ; `removeCustom` removes non-config labels). Per-operation API failures are caught and the result still records the intended operation (matching old behavior). `dryRun` short-circuits the API call.

- [ ] **Step 1: Write the failing test**

```typescript
// src/sync/labels.test.ts
import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { LabelDefinition } from "../schemas.js";
import { syncLabels } from "./labels.js";

const desired: LabelDefinition[] = [
  { name: "bug", description: "A bug", color: "d73a4a" },
  { name: "feature", description: "New", color: "0e8a16" },
];

const run = (existing: unknown[], opts: { dryRun: boolean; removeCustom: boolean }) => {
  const layer = GitHubClientTest.layer({
    restResponses: new Map([
      ["issues.createLabel", { data: {} }],
      ["issues.updateLabel", { data: {} }],
      ["issues.deleteLabel", { data: {} }],
    ]),
    graphqlResponses: new Map(),
    paginateResponses: new Map([["issues.listLabelsForRepo", [existing]]]),
    repo: { owner: "o", repo: "r" },
  });
  return syncLabels("o", "r", desired, opts.dryRun, opts.removeCustom).pipe(
    Effect.provide(layer),
    Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
    Effect.runPromise,
  );
};

describe("syncLabels", () => {
  it("creates missing, updates drifted, leaves matching unchanged", async () => {
    const existing = [
      { id: 1, name: "bug", description: "A bug", color: "ffffff" }, // color drift -> updated
      { id: 2, name: "feature", description: "New", color: "0e8a16" }, // identical -> unchanged
    ];
    const { results } = await run(existing, { dryRun: false, removeCustom: false });
    const byName = Object.fromEntries(results.map((r) => [r.name, r.operation]));
    expect(byName.bug).toBe("updated");
    expect(byName.feature).toBe("unchanged");
  });

  it("reports custom labels and removes them when removeCustom=true", async () => {
    const existing = [{ id: 9, name: "wontfix", description: "", color: "ffffff" }];
    const { results, customLabels } = await run(existing, { dryRun: false, removeCustom: true });
    expect(customLabels).toContain("wontfix");
    expect(results.some((r) => r.name === "wontfix" && r.operation === "removed")).toBe(true);
  });

  it("dry-run reports intended ops without applying", async () => {
    const { results } = await run([], { dryRun: true, removeCustom: false });
    expect(results.filter((r) => r.operation === "created")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/sync/labels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/sync/labels.ts`**

```typescript
import type { GitHubClient } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { createLabel, deleteLabel, type GitHubLabel, listLabels, updateLabel } from "../github/reads.js";
import type { LabelDefinition, LabelResult } from "../schemas.js";

export const syncLabels = (
  owner: string,
  repo: string,
  desiredLabels: ReadonlyArray<LabelDefinition>,
  dryRun: boolean,
  removeCustom: boolean,
): Effect.Effect<{ results: ReadonlyArray<LabelResult>; customLabels: ReadonlyArray<string> }, never, GitHubClient> =>
  Effect.gen(function* () {
    const existing = yield* listLabels(owner, repo).pipe(
      Effect.catchAll((e) => Effect.logWarning(`Could not list labels for ${owner}/${repo}: ${e.reason}`).pipe(Effect.as([] as ReadonlyArray<GitHubLabel>))),
    );

    const results: Array<LabelResult> = [];
    const desiredNames = new Set(desiredLabels.map((l) => l.name.toLowerCase()));
    const customLabels = existing.filter((l) => !desiredNames.has(l.name.toLowerCase())).map((l) => l.name);

    for (const want of desiredLabels) {
      const have = existing.find((l) => l.name.toLowerCase() === want.name.toLowerCase());
      if (!have) {
        if (dryRun) results.push({ name: want.name, operation: "created" });
        else {
          yield* createLabel(owner, repo, want).pipe(Effect.catchAll((e) => Effect.logWarning(`Failed to create "${want.name}": ${e.reason}`)));
          results.push({ name: want.name, operation: "created" });
        }
        continue;
      }
      const colorDiffers = have.color.toLowerCase() !== want.color.toLowerCase();
      const descriptionDiffers = (have.description ?? "") !== want.description;
      const casingDiffers = have.name !== want.name;
      if (colorDiffers || descriptionDiffers || casingDiffers) {
        const changes: Array<string> = [];
        if (casingDiffers) changes.push(`name: "${have.name}" -> "${want.name}"`);
        if (descriptionDiffers) changes.push("description");
        if (colorDiffers) changes.push(`color: #${have.color} -> #${want.color}`);
        if (!dryRun) yield* updateLabel(owner, repo, have.name, want).pipe(Effect.catchAll((e) => Effect.logWarning(`Failed to update "${want.name}": ${e.reason}`)));
        results.push({ name: want.name, operation: "updated", changes });
      } else {
        results.push({ name: want.name, operation: "unchanged" });
      }
    }

    if (removeCustom) {
      for (const name of customLabels) {
        if (!dryRun) yield* deleteLabel(owner, repo, name).pipe(Effect.catchAll((e) => Effect.logWarning(`Failed to remove "${name}": ${e.reason}`)));
        results.push({ name, operation: "removed" });
      }
    }

    return { results, customLabels };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/sync/labels.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync/labels.ts src/sync/labels.test.ts
git commit -m "feat(sync): port label sync onto GitHubClient

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 10: Sync settings

**Files:**

- Create: `src/sync/settings.ts`
- Test: `src/sync/settings.test.ts`

Preserve: diff `SYNCABLE_KEYS` against current repo, PATCH only changed keys, dry-run reports without applying, 422 is a warning (treated as `applied: false`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/sync/settings.test.ts
import { GitHubClientTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { GitHubRepo } from "../github/reads.js";
import { syncSettings } from "./settings.js";

const currentRepo = { has_wiki: true, has_issues: true, allow_squash_merge: true } as unknown as GitHubRepo;

const run = (dryRun: boolean) => {
  const layer = GitHubClientTest.layer({
    restResponses: new Map([["repos.update", { data: {} }]]),
    graphqlResponses: new Map(),
    paginateResponses: new Map(),
    repo: { owner: "o", repo: "r" },
  });
  return syncSettings("o", "r", { has_wiki: false }, currentRepo, dryRun).pipe(
    Effect.provide(layer),
    Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
    Effect.runPromise,
  );
};

describe("syncSettings", () => {
  it("detects drift and applies the change", async () => {
    const { changes, applied } = await run(false);
    expect(changes).toEqual([{ key: "has_wiki", from: true, to: false }]);
    expect(applied).toBe(true);
  });

  it("dry-run reports the diff without applying", async () => {
    const { changes, applied } = await run(true);
    expect(changes).toHaveLength(1);
    expect(applied).toBe(false);
  });

  it("returns no changes when settings already match", async () => {
    const layer = GitHubClientTest.layer({ restResponses: new Map(), graphqlResponses: new Map(), paginateResponses: new Map(), repo: { owner: "o", repo: "r" } });
    const { changes, applied } = await syncSettings("o", "r", { has_wiki: true }, currentRepo, false).pipe(
      Effect.provide(layer),
      Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
      Effect.runPromise,
    );
    expect(changes).toEqual([]);
    expect(applied).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/sync/settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/sync/settings.ts`**

```typescript
import type { GitHubClient } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import type { GitHubRepo } from "../github/reads.js";
import { updateRepo } from "../github/reads.js";
import type { RepositorySettings, SettingChange } from "../schemas.js";

const SYNCABLE_KEYS: ReadonlyArray<keyof RepositorySettings> = [
  "has_wiki",
  "has_issues",
  "has_projects",
  "has_discussions",
  "allow_merge_commit",
  "allow_squash_merge",
  "squash_merge_commit_title",
  "squash_merge_commit_message",
  "allow_rebase_merge",
  "allow_update_branch",
  "delete_branch_on_merge",
  "web_commit_signoff_required",
  "allow_auto_merge",
];

export const syncSettings = (
  owner: string,
  repo: string,
  desired: RepositorySettings,
  current: GitHubRepo,
  dryRun: boolean,
): Effect.Effect<{ changes: ReadonlyArray<SettingChange>; applied: boolean }, never, GitHubClient> =>
  Effect.gen(function* () {
    const changes: Array<SettingChange> = [];
    const toApply: Record<string, unknown> = {};
    for (const key of SYNCABLE_KEYS) {
      const want = desired[key];
      if (want === undefined) continue;
      const have = (current as Record<string, unknown>)[key];
      if (have !== want) {
        changes.push({ key, from: have, to: want });
        toApply[key] = want;
      }
    }

    if (changes.length === 0) return { changes: [], applied: true };
    if (dryRun) return { changes, applied: false };

    const applied = yield* updateRepo(owner, repo, toApply).pipe(
      Effect.as(true),
      Effect.catchAll((e) => {
        const msg = e.status === 422 ? `some settings rejected by org policy (422): ${e.reason}` : `failed to apply settings: ${e.reason}`;
        return Effect.logWarning(`  ${msg}`).pipe(Effect.as(false));
      }),
    );
    return { changes, applied };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/sync/settings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync/settings.ts src/sync/settings.test.ts
git commit -m "feat(sync): port settings sync onto GitHubClient

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 11: Sync projects (resolve cache, link, backfill)

**Files:**

- Create: `src/sync/projects.ts`
- Test: `src/sync/projects.test.ts`

Preserve: resolve unique project numbers once into a cache (closed → skip-with-reason); link repo via `linkProjectV2ToRepository`; backfill open issues/PRs via `addProjectV2ItemById` unless `skipBackfill`. "Already exists" is detected from the `GitHubGraphQLError` reason/messages. Uses the `GitHubGraphQL` service (operation names: `resolveProject`, `linkRepoToProject`, `addItemToProject`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/sync/projects.test.ts
import { GitHubClientTest, GitHubGraphQLTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { resolveProjects, syncProject } from "./projects.js";

const baseRest = (issues: unknown[]) =>
  GitHubClientTest.layer({
    restResponses: new Map(),
    graphqlResponses: new Map(),
    paginateResponses: new Map([["issues.listForRepo", [issues]]]),
    repo: { owner: "acme", repo: "r" },
  });

describe("resolveProjects", () => {
  it("caches resolved projects and marks closed ones as skip", async () => {
    const gql = GitHubGraphQLTest.empty();
    gql.state.queryResponses.set("resolveProject", { organization: { projectV2: { id: "P1", title: "Roadmap", number: 7, closed: false } } });
    const cache = await resolveProjects("acme", [7]).pipe(
      Effect.provide(gql.layer),
      Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
      Effect.runPromise,
    );
    expect(cache.get(7)).toEqual({ ok: true, project: { id: "P1", title: "Roadmap", number: 7, closed: false } });
  });
});

describe("syncProject", () => {
  it("links and backfills open items", async () => {
    const gql = GitHubGraphQLTest.empty();
    gql.state.mutationResponses.set("linkRepoToProject", { linkProjectV2ToRepository: { repository: { id: "r" } } });
    gql.state.mutationResponses.set("addItemToProject", { addProjectV2ItemById: { item: { id: "i" } } });
    const cache = new Map([[7, { ok: true as const, project: { id: "P1", title: "Roadmap", number: 7, closed: false } }]]);
    const layer = Layer.merge(gql.layer, baseRest([{ id: 1, node_id: "ISSUE_1", number: 1, title: "x" }]));

    const result = await syncProject("acme", "r", "REPO_NODE", 7, cache, false, false).pipe(
      Effect.provide(layer),
      Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
      Effect.runPromise,
    );
    expect(result.linkStatus).toBe("linked");
    expect(result.itemsAdded).toBe(1);
    expect(gql.state.mutationCalls.map((c) => c.operation)).toEqual(["linkRepoToProject", "addItemToProject"]);
  });

  it("skips when the project is not in the cache", async () => {
    const gql = GitHubGraphQLTest.empty();
    const result = await syncProject("acme", "r", "REPO_NODE", 99, new Map(), false, false).pipe(
      Effect.provide(Layer.merge(gql.layer, baseRest([]))),
      Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
      Effect.runPromise,
    );
    expect(result.linkStatus).toBe("skipped");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/sync/projects.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/sync/projects.ts`**

```typescript
import { GitHubClient, GitHubGraphQL, type GitHubGraphQLError } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { listOpenIssues } from "../github/reads.js";
import type { ProjectInfo } from "../schemas.js";

const RESOLVE_PROJECT_QUERY = `
  query ResolveProject($org: String!, $number: Int!) {
    organization(login: $org) { projectV2(number: $number) { id title number closed } }
  }
`;
const LINK_REPO_MUTATION = `
  mutation LinkRepoToProject($projectId: ID!, $repositoryId: ID!) {
    linkProjectV2ToRepository(input: { projectId: $projectId, repositoryId: $repositoryId }) { repository { id } }
  }
`;
const ADD_ITEM_MUTATION = `
  mutation AddItemToProject($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
  }
`;

interface ResolveProjectResponse {
  readonly organization: { readonly projectV2: { id: string; title: string; number: number; closed: boolean } | null };
}

export type ProjectCacheEntry = { readonly ok: true; readonly project: ProjectInfo } | { readonly ok: false; readonly error: string };
export type ProjectCache = Map<number, ProjectCacheEntry>;

/** GitHub reports an existing link/item via an "already exists" GraphQL error. */
const isAlreadyExists = (e: GitHubGraphQLError): boolean => {
  const text = `${e.reason} ${e.errors.map((x) => x.message).join(" ")}`.toLowerCase();
  return text.includes("already") || text.includes("exists");
};

export const resolveProjects = (org: string, projectNumbers: ReadonlyArray<number>): Effect.Effect<ProjectCache, never, GitHubGraphQL> =>
  Effect.gen(function* () {
    const gql = yield* GitHubGraphQL;
    const cache: ProjectCache = new Map();
    for (const num of [...new Set(projectNumbers)]) {
      const entry = yield* gql.query<ResolveProjectResponse>("resolveProject", RESOLVE_PROJECT_QUERY, { org, number: num }).pipe(
        Effect.map((data): ProjectCacheEntry => {
          const p = data.organization.projectV2;
          if (!p) return { ok: false, error: `Project #${num} not found in org "${org}"` };
          if (p.closed) return { ok: false, error: `Project "${p.title}" is closed` };
          return { ok: true, project: { id: p.id, title: p.title, number: p.number, closed: p.closed } };
        }),
        Effect.catchAll((e) => Effect.succeed({ ok: false as const, error: e.reason })),
      );
      cache.set(num, entry);
    }
    return cache;
  });

export const syncProject = (
  owner: string,
  repo: string,
  repoNodeId: string,
  projectNumber: number,
  cache: ProjectCache,
  dryRun: boolean,
  skipBackfill: boolean,
): Effect.Effect<
  { projectTitle: string | null; linkStatus: "linked" | "already" | "dry-run" | "error" | "skipped"; itemsAdded: number; itemsAlreadyPresent: number },
  never,
  GitHubGraphQL | GitHubClient
> =>
  Effect.gen(function* () {
    const entry = cache.get(projectNumber);
    if (!entry?.ok) return { projectTitle: null, linkStatus: "skipped" as const, itemsAdded: 0, itemsAlreadyPresent: 0 };

    const gql = yield* GitHubGraphQL;
    const { project } = entry;

    let linkStatus: "linked" | "already" | "dry-run" | "error";
    if (dryRun) linkStatus = "dry-run";
    else
      linkStatus = yield* gql.mutation("linkRepoToProject", LINK_REPO_MUTATION, { projectId: project.id, repositoryId: repoNodeId }).pipe(
        Effect.as("linked" as const),
        Effect.catchAll((e) => Effect.succeed(isAlreadyExists(e) ? ("already" as const) : ("error" as const))),
      );

    let itemsAdded = 0;
    let itemsAlreadyPresent = 0;
    if (!skipBackfill && linkStatus !== "error") {
      const issues = yield* listOpenIssues(owner, repo).pipe(Effect.catchAll(() => Effect.succeed([])));
      for (const item of issues) {
        if (dryRun) {
          itemsAdded++;
          continue;
        }
        const outcome = yield* gql.mutation("addItemToProject", ADD_ITEM_MUTATION, { projectId: project.id, contentId: item.node_id }).pipe(
          Effect.as("added" as const),
          Effect.catchAll((e) => Effect.succeed(isAlreadyExists(e) ? ("exists" as const) : ("error" as const))),
        );
        if (outcome === "added") itemsAdded++;
        else if (outcome === "exists") itemsAlreadyPresent++;
      }
    }

    return { projectTitle: project.title, linkStatus, itemsAdded, itemsAlreadyPresent };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/sync/projects.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync/projects.ts src/sync/projects.test.ts
git commit -m "feat(sync): port Projects v2 link/backfill onto GitHubGraphQL

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 12: Per-repo orchestration

**Files:**

- Create: `src/sync/syncRepo.ts`
- Test: `src/sync/syncRepo.test.ts`

`syncRepo` fetches the repo (records a `SyncErrorRecord` on failure, same as the old action), then runs labels → settings → projects, assembling a `RepoSyncResult`. It never fails (error channel `never`). Project number comes from the repo's `project-tracking`/`project-number` custom properties.

- [ ] **Step 1: Write the failing test**

```typescript
// src/sync/syncRepo.test.ts
import { GitHubClientTest, GitHubGraphQLTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { DiscoveredRepo, SilkConfig } from "../schemas.js";
import { syncRepo } from "./syncRepo.js";

const config: SilkConfig = { labels: [{ name: "bug", description: "", color: "d73a4a" }], settings: { has_wiki: false } };
const repo: DiscoveredRepo = { name: "r", owner: "acme", fullName: "acme/r", nodeId: "RNODE", customProperties: {} };
const inputs = { dryRun: false, removeCustomLabels: false, syncSettings: true, syncProjects: true, skipBackfill: false };

it("syncs labels + settings and reports success", async () => {
  const layer = Layer.merge(
    GitHubClientTest.layer({
      restResponses: new Map([
        ["repos.get", { data: { node_id: "RNODE", name: "r", full_name: "acme/r", owner: { login: "acme" }, has_wiki: true } }],
        ["issues.createLabel", { data: {} }],
        ["repos.update", { data: {} }],
      ]),
      graphqlResponses: new Map(),
      paginateResponses: new Map([["issues.listLabelsForRepo", [[]]]]),
      repo: { owner: "acme", repo: "r" },
    }),
    GitHubGraphQLTest.empty().layer,
  );
  const result = await syncRepo(repo, config, new Map(), inputs).pipe(
    Effect.provide(layer),
    Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
    Effect.runPromise,
  );
  expect(result.success).toBe(true);
  expect(result.labels.some((l) => l.name === "bug" && l.operation === "created")).toBe(true);
  expect(result.settingChanges).toHaveLength(1);
});

it("records an error when the repo fetch fails", async () => {
  const layer = Layer.merge(
    GitHubClientTest.layer({ restResponses: new Map(), graphqlResponses: new Map(), paginateResponses: new Map([["issues.listLabelsForRepo", [[]]]]), repo: { owner: "acme", repo: "r" } }),
    GitHubGraphQLTest.empty().layer,
  );
  const result = await syncRepo(repo, config, new Map(), { ...inputs, syncSettings: false, syncProjects: false }).pipe(
    Effect.provide(layer),
    Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
    Effect.runPromise,
  );
  expect(result.success).toBe(false);
  expect(result.errors[0].target).toBe("repo");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/sync/syncRepo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/sync/syncRepo.ts`**

```typescript
import type { GitHubClient, GitHubGraphQL } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { getRepo, type GitHubRepo } from "../github/reads.js";
import type { DiscoveredRepo, RepoSyncResult, SettingChange, SilkConfig, SyncErrorRecord } from "../schemas.js";
import { syncLabels } from "./labels.js";
import type { ProjectCache } from "./projects.js";
import { syncProject } from "./projects.js";
import { syncSettings } from "./settings.js";

export interface SyncInputs {
  readonly dryRun: boolean;
  readonly removeCustomLabels: boolean;
  readonly syncSettings: boolean;
  readonly syncProjects: boolean;
  readonly skipBackfill: boolean;
}

const projectNumberOf = (repo: DiscoveredRepo): number | null => {
  if (repo.customProperties["project-tracking"] !== "true") return null;
  const raw = repo.customProperties["project-number"];
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const syncRepo = (
  repo: DiscoveredRepo,
  config: SilkConfig,
  projectCache: ProjectCache,
  inputs: SyncInputs,
): Effect.Effect<RepoSyncResult, never, GitHubClient | GitHubGraphQL> =>
  Effect.gen(function* () {
    const errors: Array<SyncErrorRecord> = [];

    const repoData = yield* getRepo(repo.owner, repo.name).pipe(
      Effect.catchAll((e) => {
        errors.push({ target: "repo", operation: "get", error: e.reason });
        return Effect.succeed(null as GitHubRepo | null);
      }),
    );

    const labelResult = yield* syncLabels(repo.owner, repo.name, config.labels, inputs.dryRun, inputs.removeCustomLabels);

    let settings: { changes: ReadonlyArray<SettingChange>; applied: boolean } = { changes: [], applied: true };
    if (inputs.syncSettings && repoData) settings = yield* syncSettings(repo.owner, repo.name, config.settings, repoData, inputs.dryRun);

    let project = { projectTitle: null as string | null, linkStatus: null as RepoSyncResult["projectLinkStatus"], itemsAdded: 0, itemsAlreadyPresent: 0 };
    const projectNumber = projectNumberOf(repo);
    if (inputs.syncProjects && projectNumber !== null) {
      const nodeId = repoData?.node_id ?? repo.nodeId;
      project = yield* syncProject(repo.owner, repo.name, nodeId, projectNumber, projectCache, inputs.dryRun, inputs.skipBackfill);
    }

    return {
      repo: repo.name,
      owner: repo.owner,
      labels: [...labelResult.results],
      customLabels: [...labelResult.customLabels],
      settingChanges: [...settings.changes],
      settingsApplied: settings.applied,
      projectNumber,
      projectTitle: project.projectTitle,
      projectLinkStatus: project.linkStatus,
      itemsAdded: project.itemsAdded,
      itemsAlreadyPresent: project.itemsAlreadyPresent,
      errors: [...errors],
      success: errors.length === 0,
    } satisfies RepoSyncResult;
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/sync/syncRepo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync/syncRepo.ts src/sync/syncRepo.test.ts
git commit -m "feat(sync): per-repo orchestration

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 13: Stats aggregation + processRepos

**Files:**

- Create: `src/reporting/stats.ts`
- Create: `src/sync/processRepos.ts`
- Test: `src/reporting/stats.test.ts`
- Test: `src/sync/processRepos.test.ts`

`aggregateStats` is a pure function ported verbatim from `src/lib/reporting/console.ts` (the `aggregateStats` + `SyncStats` parts only; console printing is replaced by structured logging in the program). `processRepos` runs `syncRepo` over all repos sequentially via `ErrorAccumulator.forEachAccumulate` (its failure channel is `never`, so `successes` holds every `RepoSyncResult`).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/reporting/stats.test.ts
import { describe, expect, it } from "vitest";
import type { RepoSyncResult } from "../schemas.js";
import { aggregateStats } from "./stats.js";

const base: RepoSyncResult = {
  repo: "r", owner: "o", labels: [], customLabels: [], settingChanges: [], settingsApplied: true,
  projectNumber: null, projectTitle: null, projectLinkStatus: null, itemsAdded: 0, itemsAlreadyPresent: 0, errors: [], success: true,
};

describe("aggregateStats", () => {
  it("counts label operations, drift, and project links", () => {
    const stats = aggregateStats([
      { ...base, labels: [{ name: "a", operation: "created" }, { name: "b", operation: "unchanged" }], settingChanges: [{ key: "has_wiki", from: true, to: false }], projectLinkStatus: "linked", itemsAdded: 3 },
      { ...base, projectLinkStatus: "already", success: false, errors: [{ target: "repo", operation: "get", error: "x" }] },
    ]);
    expect(stats.total).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.labels.created).toBe(1);
    expect(stats.labels.unchanged).toBe(1);
    expect(stats.settings.reposWithDrift).toBe(1);
    expect(stats.projects.linked).toBe(1);
    expect(stats.projects.alreadyLinked).toBe(1);
    expect(stats.projects.itemsAdded).toBe(3);
  });
});
```

```typescript
// src/sync/processRepos.test.ts
import { GitHubClientTest, GitHubGraphQLTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { DiscoveredRepo, SilkConfig } from "../schemas.js";
import { processRepos } from "./processRepos.js";

const config: SilkConfig = { labels: [], settings: {} };
const repos: DiscoveredRepo[] = [
  { name: "r1", owner: "acme", fullName: "acme/r1", nodeId: "N1", customProperties: {} },
  { name: "r2", owner: "acme", fullName: "acme/r2", nodeId: "N2", customProperties: {} },
];

it("processes every repo and returns one result each", async () => {
  const layer = Layer.merge(
    GitHubClientTest.layer({
      restResponses: new Map([["repos.get", { data: { node_id: "N", name: "r", full_name: "acme/r", owner: { login: "acme" } } }]]),
      graphqlResponses: new Map(),
      paginateResponses: new Map([["issues.listLabelsForRepo", [[]]]]),
      repo: { owner: "acme", repo: "r" },
    }),
    GitHubGraphQLTest.empty().layer,
  );
  const results = await processRepos(repos, config, new Map(), { dryRun: false, removeCustomLabels: false, syncSettings: false, syncProjects: false, skipBackfill: false }).pipe(
    Effect.provide(layer),
    Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
    Effect.runPromise,
  );
  expect(results).toHaveLength(2);
  expect(results.map((r) => r.repo)).toEqual(["r1", "r2"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/reporting/stats.test.ts src/sync/processRepos.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/reporting/stats.ts`**

```typescript
import type { RepoSyncResult } from "../schemas.js";

export interface SyncStats {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly labels: { readonly created: number; readonly updated: number; readonly removed: number; readonly unchanged: number; readonly customCount: number };
  readonly settings: { readonly changed: number; readonly reposWithDrift: number };
  readonly projects: { readonly linked: number; readonly alreadyLinked: number; readonly itemsAdded: number; readonly itemsAlreadyPresent: number };
}

export const aggregateStats = (results: ReadonlyArray<RepoSyncResult>): SyncStats => {
  let created = 0, updated = 0, removed = 0, unchanged = 0, customCount = 0;
  let changed = 0, reposWithDrift = 0;
  let linked = 0, alreadyLinked = 0, itemsAdded = 0, itemsAlreadyPresent = 0;

  for (const r of results) {
    for (const l of r.labels) {
      if (l.operation === "created") created++;
      else if (l.operation === "updated") updated++;
      else if (l.operation === "removed") removed++;
      else if (l.operation === "unchanged") unchanged++;
    }
    customCount += r.customLabels.length;
    if (r.settingChanges.length > 0) {
      changed += r.settingChanges.length;
      reposWithDrift++;
    }
    if (r.projectLinkStatus === "linked" || r.projectLinkStatus === "dry-run") linked++;
    else if (r.projectLinkStatus === "already") alreadyLinked++;
    itemsAdded += r.itemsAdded;
    itemsAlreadyPresent += r.itemsAlreadyPresent;
  }

  return {
    total: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    labels: { created, updated, removed, unchanged, customCount },
    settings: { changed, reposWithDrift },
    projects: { linked, alreadyLinked, itemsAdded, itemsAlreadyPresent },
  };
};
```

- [ ] **Step 4: Write `src/sync/processRepos.ts`**

```typescript
import { ErrorAccumulator, type GitHubClient, type GitHubGraphQL } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import type { DiscoveredRepo, RepoSyncResult, SilkConfig } from "../schemas.js";
import type { ProjectCache } from "./projects.js";
import { type SyncInputs, syncRepo } from "./syncRepo.js";

export const processRepos = (
  repos: ReadonlyArray<DiscoveredRepo>,
  config: SilkConfig,
  projectCache: ProjectCache,
  inputs: SyncInputs,
): Effect.Effect<ReadonlyArray<RepoSyncResult>, never, GitHubClient | GitHubGraphQL> =>
  Effect.gen(function* () {
    const result = yield* ErrorAccumulator.forEachAccumulate(repos, (repo) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(`Processing ${repo.fullName}`);
        return yield* syncRepo(repo, config, projectCache, inputs);
      }),
    );
    // syncRepo never fails, so `failures` is always empty; `successes` is every result.
    return result.successes;
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/reporting/stats.test.ts src/sync/processRepos.test.ts`
Expected: PASS (2 tests total).

- [ ] **Step 6: Commit**

```bash
git add src/reporting/stats.ts src/sync/processRepos.ts src/reporting/stats.test.ts src/sync/processRepos.test.ts
git commit -m "feat(sync): aggregate stats and process repos sequentially

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 14: Step summary builder

**Files:**

- Create: `src/reporting/summary.ts`
- Test: `src/reporting/summary.test.ts`

`buildSummaryMarkdown` is a pure function producing the step-summary markdown from `SyncStats` + flags using `GithubMarkdown`. (Writing it to the summary happens in `program.ts` via `ActionOutputs.summary`.)

- [ ] **Step 1: Write the failing test**

```typescript
// src/reporting/summary.test.ts
import { describe, expect, it } from "vitest";
import type { SyncStats } from "./stats.js";
import { buildSummaryMarkdown } from "./summary.js";

const stats: SyncStats = {
  total: 2, succeeded: 2, failed: 0,
  labels: { created: 1, updated: 0, removed: 0, unchanged: 3, customCount: 0 },
  settings: { changed: 1, reposWithDrift: 1 },
  projects: { linked: 1, alreadyLinked: 0, itemsAdded: 2, itemsAlreadyPresent: 0 },
};

describe("buildSummaryMarkdown", () => {
  it("includes a heading and repo counts", () => {
    const md = buildSummaryMarkdown(stats, { dryRun: false, syncSettings: true, syncProjects: true });
    expect(md).toContain("Silk Sync");
    expect(md).toContain("2");
  });

  it("notes dry-run mode", () => {
    const md = buildSummaryMarkdown(stats, { dryRun: true, syncSettings: true, syncProjects: true });
    expect(md.toLowerCase()).toContain("dry");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/reporting/summary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/reporting/summary.ts`**

```typescript
import { GithubMarkdown } from "@savvy-web/github-action-effects";
import type { SyncStats } from "./stats.js";

export const buildSummaryMarkdown = (
  stats: SyncStats,
  flags: { readonly dryRun: boolean; readonly syncSettings: boolean; readonly syncProjects: boolean },
): string => {
  const parts: Array<string> = [];
  parts.push(GithubMarkdown.heading(flags.dryRun ? "Silk Sync (dry-run)" : "Silk Sync", 2));
  parts.push(
    GithubMarkdown.table(
      ["Repositories", "Count"],
      [
        ["Total", String(stats.total)],
        ["Succeeded", String(stats.succeeded)],
        ["Failed", String(stats.failed)],
      ],
    ),
  );
  parts.push(
    GithubMarkdown.table(
      ["Labels", "Count"],
      [
        ["Created", String(stats.labels.created)],
        ["Updated", String(stats.labels.updated)],
        ["Removed", String(stats.labels.removed)],
        ["Unchanged", String(stats.labels.unchanged)],
        ["Custom found", String(stats.labels.customCount)],
      ],
    ),
  );
  if (flags.syncSettings) {
    parts.push(GithubMarkdown.table(["Settings", "Count"], [["Changed", String(stats.settings.changed)], ["Repos with drift", String(stats.settings.reposWithDrift)]]));
  }
  if (flags.syncProjects) {
    parts.push(
      GithubMarkdown.table(
        ["Projects", "Count"],
        [
          ["Linked", String(stats.projects.linked)],
          ["Already linked", String(stats.projects.alreadyLinked)],
          ["Items added", String(stats.projects.itemsAdded)],
          ["Items already present", String(stats.projects.itemsAlreadyPresent)],
        ],
      ),
    );
  }
  return parts.join("\n\n");
};
```

> If `GithubMarkdown.heading`/`table` signatures differ from the reference, adjust the calls; the function contract (returns a markdown string) and the tests are the spec.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/reporting/summary.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/reporting/summary.ts src/reporting/summary.test.ts
git commit -m "feat(reporting): build step-summary markdown

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 15: Main program

**Files:**

- Create: `src/program.ts`
- Test: `src/program.test.ts`

The `main` program: read inputs, resolve repo owner via `GitHubClient.repo`, load + validate config via `ConfigLoader.loadJson`, discover repos, resolve projects, process repos, write the step summary, and set outputs (`results` JSON + scalar convenience outputs). Fatal failures route to `ActionOutputs.setFailed`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/program.test.ts
import {
  ActionOutputsTest,
  ConfigLoaderTest,
  GitHubClientTest,
  GitHubGraphQLTest,
} from "@savvy-web/github-action-effects/testing";
import { ConfigProvider, Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { program } from "./program.js";
import type { SilkConfig } from "./schemas.js";

const config: SilkConfig = { labels: [{ name: "bug", description: "", color: "d73a4a" }], settings: {} };

const outputValue = (state: ReturnType<typeof ActionOutputsTest.empty>, name: string) =>
  state.outputs.find((o) => o.name === name)?.value;

it("discovers, syncs, and sets outputs", async () => {
  const outputs = ActionOutputsTest.empty();
  const layer = Layer.mergeAll(
    ActionOutputsTest.layer(outputs),
    ConfigLoaderTest.layer({ files: new Map([[".github/silk.config.json", config]]) }),
    GitHubClientTest.layer({
      restResponses: new Map([["repos.get", { data: { node_id: "N", name: "a", full_name: "acme/a", owner: { login: "acme" } } }]]),
      graphqlResponses: new Map(),
      paginateResponses: new Map([["issues.listLabelsForRepo", [[]]]]),
      repo: { owner: "acme", repo: "a" },
    }),
    GitHubGraphQLTest.empty().layer,
  );
  const cfgProvider = ConfigProvider.fromMap(new Map([["repos", "a"]]));
  await program.pipe(
    Effect.withConfigProvider(cfgProvider),
    Effect.provide(layer),
    Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
    Effect.runPromise,
  );
  expect(outputValue(outputs, "success")).toBe("true");
  expect(outputValue(outputs, "repos-total")).toBe("1");
  expect(outputValue(outputs, "results")).toContain("\"success\":true");
});
```

> Confirm `ConfigLoaderTest`'s seeding shape against `@savvy-web/github-action-effects/testing` (read `src/layers/ConfigLoaderTest.ts`). If it seeds by raw string rather than decoded value, adjust the `files` map to hold the JSON string `JSON.stringify(config)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/program.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/program.ts`**

```typescript
import { ActionOutputs, ConfigLoader, GitHubClient, Step } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { discoverRepos } from "./discovery/index.js";
import { parseInputs } from "./inputs.js";
import { buildSummaryMarkdown } from "./reporting/summary.js";
import { aggregateStats } from "./reporting/stats.js";
import { type DiscoveredRepo, ResultsOutput, SilkConfig } from "./schemas.js";
import { processRepos } from "./sync/processRepos.js";
import { resolveProjects } from "./sync/projects.js";

const projectNumbersOf = (repos: ReadonlyArray<DiscoveredRepo>): ReadonlyArray<number> => {
  const set = new Set<number>();
  for (const r of repos) {
    if (r.customProperties["project-tracking"] !== "true") continue;
    const n = Number.parseInt(r.customProperties["project-number"] ?? "", 10);
    if (Number.isFinite(n) && n > 0) set.add(n);
  }
  return [...set];
};

export const program = Effect.gen(function* () {
  const outputs = yield* ActionOutputs;
  const inputs = yield* parseInputs;
  const { owner: org } = yield* GitHubClient.pipe(Effect.flatMap((gh) => gh.repo));

  const loader = yield* ConfigLoader;
  const config = yield* loader.loadJson(inputs.configFile, SilkConfig);
  yield* Effect.logInfo(`Config loaded: ${config.labels.length} labels`);

  const repos = yield* Step.groupStep("Discover repositories", discoverRepos(org, inputs));
  const projectNumbers = inputs.syncProjects ? projectNumbersOf(repos) : [];
  const projectCache = yield* resolveProjects(org, projectNumbers);
  const results = yield* Step.groupStep("Sync repositories", processRepos(repos, config, projectCache, inputs));

  const stats = aggregateStats(results);
  yield* outputs.summary(buildSummaryMarkdown(stats, inputs));

  const failed = results.filter((r) => !r.success);
  const resultsValue = {
    success: failed.length === 0,
    dryRun: inputs.dryRun,
    repos: { total: stats.total, succeeded: stats.succeeded, failed: stats.failed },
    labels: stats.labels,
    settings: stats.settings,
    projects: stats.projects,
    errors: failed.map((r) => ({ repo: `${r.owner}/${r.repo}`, details: r.errors })),
  };
  yield* outputs.setJson("results", resultsValue, ResultsOutput);
  yield* outputs.set("success", String(failed.length === 0));
  yield* outputs.set("repos-total", String(stats.total));
  yield* outputs.set("repos-succeeded", String(stats.succeeded));
  yield* outputs.set("repos-failed", String(stats.failed));

  if (stats.failed > 0) yield* Effect.logWarning(`${stats.failed}/${stats.total} repos had errors`);
}).pipe(
  Effect.catchAll((error) =>
    Effect.flatMap(ActionOutputs, (outputs) => outputs.setFailed(`Sync failed: ${error instanceof Error ? error.message : String(error)}`)),
  ),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/program.test.ts`
Expected: PASS (1 test). If `ConfigLoaderTest` seeding differs, fix per the Step-1 note, then re-run.

- [ ] **Step 5: Commit**

```bash
git add src/program.ts src/program.test.ts
git commit -m "feat: wire main program (discover, sync, report, outputs)

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 16: Layer composition

**Files:**

- Create: `src/layers/app.ts`

No new tests (composition is exercised by Task 15's program test for `MainLive`'s services and Task 17's pre/post tests). Mirror `../pnpm-config-dependency-action/src/layers/app.ts` and `../silk-release-action/src/pre.ts`.

- [ ] **Step 1: Write `src/layers/app.ts`**

```typescript
import {
  ActionStateLive,
  ConfigLoaderLive,
  GitHubAppLive,
  GitHubGraphQLLive,
  GitHubToken,
  OctokitAuthAppLive,
} from "@savvy-web/github-action-effects";
import { FetchHttpClient } from "@effect/platform";
import { NodeContext, NodeFileSystem } from "@effect/platform-node";
import { Layer } from "effect";

/** pre/post: GitHubApp (for provision/dispose) + filesystem for ActionState. */
export const PreLive = Layer.mergeAll(
  GitHubAppLive.pipe(Layer.provide(OctokitAuthAppLive), Layer.provide(FetchHttpClient.layer)),
  NodeFileSystem.layer,
);
export const PostLive = PreLive;

/** main: GitHubClient (from the persisted token) + GraphQL + ConfigLoader. */
const actionState = ActionStateLive.pipe(Layer.provide(NodeContext.layer));
const githubClient = GitHubToken.client().pipe(Layer.provide(actionState), Layer.orDie);
const githubGraphql = GitHubGraphQLLive.pipe(Layer.provide(githubClient));
const configLoader = ConfigLoaderLive.pipe(Layer.provide(NodeContext.layer));

export const MainLive = Layer.mergeAll(githubClient, githubGraphql, configLoader);
```

> Confirm `ConfigLoaderLive`'s requirement (FileSystem) is satisfied by `NodeContext.layer`. If typecheck complains it needs `FileSystem` only, swap to `NodeFileSystem.layer`.

- [ ] **Step 2: Typecheck the layer module in isolation**

Run: `pnpm exec tsgo --noEmit src/layers/app.ts` (or rely on the full `pnpm run typecheck` after Task 18 cleanup)
Expected: no type errors in `app.ts` (errors from the old `lib/` tree are still present until Task 18).

- [ ] **Step 3: Commit**

```bash
git add src/layers/app.ts
git commit -m "feat: compose Pre/Main/Post layers

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 17: Entrypoints (pre / main / post)

**Files:**

- Create: `src/pre.ts`
- Create: `src/main.ts`
- Create: `src/post.ts`
- Test: `src/pre.test.ts`
- Test: `src/post.test.ts`

`pre` saves start time and provisions the token with the required permissions; `main` runs `program`; `post` logs duration and disposes the token (best-effort, never fails the workflow). Mirror `../silk-release-action/src/{pre,post}.ts`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/pre.test.ts
import { ActionOutputsTest, ActionStateTest, GitHubAppTest } from "@savvy-web/github-action-effects/testing";
import { ConfigProvider, Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { pre } from "./pre.js";

it("provisions a token and saves start time", async () => {
  const outputs = ActionOutputsTest.empty();
  const state = ActionStateTest.empty();
  const app = GitHubAppTest.empty();
  const layer = Layer.mergeAll(ActionOutputsTest.layer(outputs), ActionStateTest.layer(state), GitHubAppTest.layer(app));
  const cfg = ConfigProvider.fromMap(new Map([["app-client-id", "cid"], ["app-private-key", "pk"]]));
  await pre.pipe(Effect.withConfigProvider(cfg), Effect.provide(layer), Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)), Effect.runPromise);
  expect(state.entries.has("startTime")).toBe(true);
  expect(app.generateCalls.length).toBeGreaterThanOrEqual(1);
});
```

```typescript
// src/post.test.ts
import { ActionStateTest, GitHubAppTest } from "@savvy-web/github-action-effects/testing";
import { ConfigProvider, Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { post } from "./post.js";

it("disposes the token without throwing when state is present", async () => {
  const state = ActionStateTest.empty();
  const app = GitHubAppTest.empty();
  const layer = Layer.mergeAll(ActionStateTest.layer(state), GitHubAppTest.layer(app));
  const cfg = ConfigProvider.fromMap(new Map());
  await expect(
    post.pipe(Effect.withConfigProvider(cfg), Effect.provide(layer), Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)), Effect.runPromise),
  ).resolves.toBeUndefined();
});
```

> Confirm `GitHubAppTest`'s state field for recorded provisioning calls (the reference shows `generateCalls`; verify in `src/layers/GitHubAppTest.ts`). If `GitHubToken.provision` requires `ActionOutputs` and `post` does not provide it, add `ActionOutputsTest.layer(ActionOutputsTest.empty())` to the `pre` test layer (already included) — `post` only needs `ActionState | GitHubApp`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/pre.test.ts src/post.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/pre.ts`**

```typescript
import { Action, ActionState, GitHubToken } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { PreLive } from "./layers/app.js";
import { STATE_KEYS, StartTimeState } from "./state.js";

/** Fine-grained installation permissions silk-sync requires. */
const REQUIRED_PERMISSIONS = {
  administration: "write",
  issues: "write",
  organization_custom_properties: "read",
  organization_projects: "write",
} as const;

export const pre = Effect.gen(function* () {
  const state = yield* ActionState;
  yield* state.save(STATE_KEYS.startTime, new StartTimeState({ startedAt: Date.now() }), StartTimeState);

  yield* Effect.logInfo("Generating GitHub App installation token...");
  const token = yield* GitHubToken.provision({ permissions: REQUIRED_PERMISSIONS });
  yield* Effect.logInfo(`Token generated (expires: ${token.expiresAt})`);
});

/* v8 ignore next 3 */
if (process.env.GITHUB_ACTIONS) {
  await Action.run(pre, { layer: PreLive });
}
```

> The exact permission key names (`administration`, `issues`, `organization_custom_properties`, `organization_projects`) must match GitHub's installation-permission identifiers. Verify against the GitHub REST docs / a real provision call during live testing (Task 19); adjust if `provision` reports a key it cannot verify.

- [ ] **Step 4: Write `src/main.ts`**

```typescript
import { Action } from "@savvy-web/github-action-effects";
import { MainLive } from "./layers/app.js";
import { program } from "./program.js";

/* v8 ignore next */
Action.run(program, { layer: MainLive });
```

- [ ] **Step 5: Write `src/post.ts`**

```typescript
import { Action, ActionState, GitHubToken } from "@savvy-web/github-action-effects";
import { Effect, Option } from "effect";
import { PostLive } from "./layers/app.js";
import { STATE_KEYS, StartTimeState } from "./state.js";

export const post = Effect.gen(function* () {
  const state = yield* ActionState;
  const start = yield* state.getOptional(STATE_KEYS.startTime, StartTimeState);
  if (Option.isSome(start)) {
    const duration = Date.now() - start.value.startedAt;
    yield* Effect.logInfo(`Total duration: ${(duration / 1000).toFixed(1)}s`);
  }
  yield* Effect.logInfo("Revoking installation token...");
  yield* GitHubToken.dispose().pipe(Effect.catchAll((e) => Effect.logWarning(`Token revocation failed: ${e instanceof Error ? e.message : String(e)}`)));
}).pipe(Effect.catchAllDefect((d) => Effect.logWarning(`Post-action warning: ${d instanceof Error ? d.message : String(d)}`)));

/* v8 ignore next 3 */
if (process.env.GITHUB_ACTIONS) {
  await Action.run(post, { layer: PostLive });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run src/pre.test.ts src/post.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/pre.ts src/main.ts src/post.ts src/pre.test.ts src/post.test.ts
git commit -m "feat: add pre/main/post entrypoints

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 18: Remove old tree, update action.yml, CLAUDE.md; full verification

**Files:**

- Delete: `src/lib/` (entire directory) and any colocated tests
- Modify: `action.yml`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Delete the old implementation tree**

```bash
git rm -r src/lib
```

- [ ] **Step 2: Rewrite `action.yml` inputs/outputs**

Replace the `inputs:` and `outputs:` blocks (keep `name`, `description`, `author`, `branding`, and the `runs:` block — still `node24` with `pre`/`main`/`post`):

```yaml
inputs:
  app-client-id:
    description: GitHub App client ID for authentication
    required: true
  app-private-key:
    description: GitHub App private key (PEM format)
    required: true
  config-file:
    description: Path to JSON config file (labels + settings)
    required: true
    default: .github/silk.config.json
  custom-properties:
    description: |-
      Multiline key=value pairs for org custom property matching (AND logic). Example:
        workflow=standard
        team=platform
    required: false
  repos:
    description: Multiline list of explicit repository names (one per line). Supports bare names or owner/repo format.
    required: false
  dry-run:
    description: Preview changes without applying them
    required: false
    default: "false"
  remove-custom-labels:
    description: Remove labels not in config defaults
    required: false
    default: "false"
  sync-settings:
    description: Sync repository settings
    required: false
    default: "true"
  sync-projects:
    description: Sync project linking and backfill
    required: false
    default: "true"
  skip-backfill:
    description: Link repos to projects only, skip adding items
    required: false
    default: "false"
outputs:
  results:
    description: JSON string with sync results (repo counts, label/settings/project stats, per-repo errors). Parse with fromJSON().
  success:
    description: "true when all repos synced without errors"
  repos-total:
    description: Total repositories processed
  repos-succeeded:
    description: Repositories synced without errors
  repos-failed:
    description: Repositories with at least one error
```

- [ ] **Step 3: Update `CLAUDE.md`**

In `CLAUDE.md`, update the "Source Layout", "Key Patterns", dependency mentions, and the input list to reflect: library-based services (no custom REST/GraphQL/auth), `src/` flat layout (no `src/lib/`), `app-client-id` input, dropped `log-level`/`skip-token-revoke`. Keep the Development & Release Cycle section. (Use the `claude-md-management:revise-claude-md` skill if available; otherwise edit directly.)

- [ ] **Step 4: Lint**

Run: `pnpm run lint`
Expected: PASS (fix any Biome issues with `pnpm run lint:fix`).

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS — no references to `@actions/*`/`@octokit/*` remain.

- [ ] **Step 6: Full test suite with coverage**

Run: `pnpm run test:coverage`
Expected: PASS, coverage ≥80% on the new modules.

- [ ] **Step 7: Generate schema + build + validate**

Run: `pnpm run generate:schema && pnpm run build && pnpm run validate`
Expected: `silk.config.schema.json` regenerated unchanged (the `SilkConfig` shape is preserved); `dist/{pre,main,post}.js` produced; `github-action-builder validate` passes against the new `action.yml`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat!: rewrite silk-sync-action on github-action-effects

BREAKING CHANGE: renames the app-id input to app-client-id and removes the
log-level and skip-token-revoke inputs. Adds success/repos-* scalar outputs.

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Task 19: Live validation and 1.0.0 release (gated)

No code; this task is the release runway described in the spec (§9). It is gated on upstream library ticket **#139** (403 + Retry-After retryable) being released, since `main` relies entirely on library resilience.

- [ ] **Step 1: Confirm #139 status**

If #139 is unreleased and needed, implement it in `../github-action-effects` per its issue, `pnpm build` there, `pnpm link /Users/spencer/workspaces/savvy-web/github-action-effects/dist/npm` here, re-run `pnpm run test` + `pnpm run build`, then release the library and **unlink** before opening the silk-sync PR.

- [ ] **Step 2: Push `dev` and test live**

```bash
git push origin dev
```

From a consumer repo, point the action at `savvy-web/silk-sync-action@dev` and run a dry-run (`dry-run: true`) against a test org. Verify: token provisioning + permission check, discovery counts, label/settings/project diffs, the step summary, and the `results`/scalar outputs.

- [ ] **Step 3: Confirm fine-grained permission names**

During the live run, confirm `GitHubToken.provision({ permissions: … })` accepts and verifies the four declared scopes. Fix the keys in `src/pre.ts` if `provision` reports an unverifiable key.

- [ ] **Step 4: Open PR `dev` → `main`**

Open the PR (Conventional title, DCO signoff, body ending with the signoff trailer). After merge, the release flow cuts the version; ensure the changeset bumps to **1.0.0** so `release-sync.yml` creates the `v1` alias tag for `@v1` pinning.

---

## Self-review notes (for the implementer)

- **Spec coverage:** Tasks 1–18 cover every spec section — phases (16,17), deletions (1,18), contract redesign (4,18), discovery (6–8), sync (9–12), reporting (13,14), program/outputs (15), testing (every task), build/release (18,19), upstream #139 (19). #140 is intentionally out of scope (raw `octokit.request` used in Task 5).
- **Type consistency:** `SilkInputs` (Task 4) is consumed structurally by `processRepos`/`syncRepo` via the narrower `SyncInputs` (Task 12) and `buildSummaryMarkdown` flags (Task 14) — `SilkInputs` includes all `SyncInputs` fields plus `configFile`/`customProperties`/`repos`, so passing `inputs` where `SyncInputs` is expected typechecks. Operation-name strings in `src/github/reads.ts` (Task 5) match the test seeding keys in Tasks 6–13. GraphQL operation names (`resolveProject`/`linkRepoToProject`/`addItemToProject`) match between `src/sync/projects.ts` and its tests.
- **Library-signature confirmations flagged inline** (do these as you reach them, against the real source): `Effect.asVoid` name (Task 5), `ConfigLoaderLive` FileSystem requirement (Task 16), `ConfigLoaderTest` seeding shape (Task 15), `GitHubAppTest` recorded-calls field (Task 17), `GithubMarkdown` method signatures (Task 14), and GitHub permission key names (Tasks 17/19).
