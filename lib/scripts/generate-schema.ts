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
import { JSONSchema } from "effect";

// biome-ignore lint/correctness/useImportExtensions: Node 24 native TS requires .ts extension
import { SilkConfig } from "../../src/lib/schemas/index.ts";

const OUTPUT_PATH = resolve(import.meta.dirname, "../../silk.config.schema.json");

async function generate(): Promise<void> {
	const jsonSchema = JSONSchema.make(SilkConfig);

	const schemaWithMeta = {
		...jsonSchema,
		$schema: "http://json-schema.org/draft-07/schema#",
		title: "Silk Sync Configuration",
		description:
			"Configuration for the silk-sync workflow that standardizes repository labels and settings across the organization.",
	};

	await writeFile(OUTPUT_PATH, `${JSON.stringify(schemaWithMeta, null, "\t")}\n`, "utf-8");

	console.log(`Generated: ${OUTPUT_PATH}`);
}

generate().catch((e) => {
	console.error("Failed to generate JSON schema:", e);
	process.exit(1);
});
