import { VitestConfig } from "@savvy-web/vitest";

export default VitestConfig.create({
	pool: "forks",
	coverageExclude: ["src/types/**/*.ts", "**/*.d.ts"],
});
