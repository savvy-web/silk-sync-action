/**
 * Build-time JSON Schema generator.
 *
 * @remarks
 * Generates `silk.config.schema.json` from the {@link SilkConfig} Effect
 * Schema so the published JSON schema always matches runtime validation.
 *
 * Run via: `pnpm run generate:schema`
 *
 * @module scripts/generate-schema
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JsonSchema, Schema } from "effect";
import { SilkConfig } from "../../src/schemas.js";

const OUTPUT_PATH = resolve(import.meta.dirname, "../../silk.config.schema.json");

async function generate(): Promise<void> {
	// v4 emits a `Document` ({ dialect, schema, definitions }) on the 2020-12
	// dialect; `toDocumentDraft07` rewrites `#/$defs/...` refs to
	// `#/definitions/...` for the draft-07 output this action publishes.
	const { schema, definitions } = JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(SilkConfig));

	const schemaWithMeta = {
		$schema: "http://json-schema.org/draft-07/schema#",
		title: "Silk Sync Configuration",
		description:
			"Configuration for the silk-sync workflow that standardizes repository labels and settings across the organization.",
		...schema,
		...(Object.keys(definitions).length > 0 ? { definitions } : {}),
	};

	await writeFile(OUTPUT_PATH, `${JSON.stringify(schemaWithMeta, null, "\t")}\n`, "utf-8");

	console.log(`Generated: ${OUTPUT_PATH}`);
}

generate().catch((e) => {
	console.error("Failed to generate JSON schema:", e);
	process.exit(1);
});
