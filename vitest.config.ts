import { VitestConfig } from "@savvy-web/vitest";

export default VitestConfig.create(({ projects, coverage, reporters }) => ({
	test: {
		reporters,
		projects: projects.map((p) => p.toConfig()),
		coverage: {
			provider: "v8",
			...coverage,
			exclude: [
				...coverage.exclude,
				"src/types/**/*.ts",
				"**/*.d.ts",
				"src/lib/errors/types.ts",
				// Entry points (NodeRuntime.runMain wrappers)
				"src/main.ts",
				"src/pre.ts",
				"src/post.ts",
				// API integration boundaries (Octokit wrappers)
				"src/lib/services/rest.ts",
				"src/lib/services/graphql.ts",
				"src/lib/services/index.ts",
				"src/lib/services/types.ts",
				"src/lib/github/auth.ts",
				// Test utilities
				"src/lib/test-helpers.ts",
			],
		},
	},
}));
