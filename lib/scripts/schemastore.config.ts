/**
 * The `effected schema` config: `silk.config.schema.json`, derived from the
 * {@link SilkConfig} Effect Schema so editor completion and runtime
 * validation share one source of truth.
 *
 * @remarks
 * Lives under `lib/scripts/` (`src/` is action source only), so the
 * package.json scripts hand the CLI this path explicitly.
 *
 * Unlike a versioned `schemas/<version>/<name>.json` layout, this action
 * publishes one unversioned document at the repository root: user configs
 * (and `silk.config.example.json`) pin
 * `https://raw.githubusercontent.com/savvy-web/silk-sync-action/main/silk.config.schema.json`,
 * so the key, `outputDir`, `baseUrl` and the `"flat"` layout are chosen to
 * derive exactly that path and `$id`. Moving the file would break every
 * consumer's `$schema` reference.
 *
 * Objects are generated closed (`additionalProperties: false`) by default,
 * which is what flags a misspelled key in an editor. No `catalog` block: the
 * document is not submitted to SchemaStore, so no catalog slice is written.
 */

import { defineSchemastore } from "@effected/plugin";
import { SilkConfig } from "../../src/schemas.js";

export default defineSchemastore({
	name: "silk-sync-action",
	// Relative paths resolve against this file's directory, not the cwd.
	outputDir: "../..",
	baseUrl: "https://raw.githubusercontent.com/savvy-web/silk-sync-action/main",
	schemas: {
		"silk.config.schema": {
			schema: SilkConfig,
			layout: "flat",
			rootAnnotations: {
				title: "Silk Sync Configuration",
				description:
					"Configuration for the silk-sync workflow that standardizes repository labels and settings across the organization.",
			},
		},
	},
});
