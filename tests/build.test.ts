import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildEntry, getEntryPath, getImportsWatchDirs } from "../src/build.ts";
import { createTempDir } from "./helpers/tempDir.ts";

const INDEX_PATH = fileURLToPath(new URL("../src/index.ts", import.meta.url));

describe("getEntryPath", () => {
	it("joins the outDir with the entry file name", () => {
		assert.equal(getEntryPath("/some/out"), join("/some/out", "entry.js"));
	});
});

describe("getImportsWatchDirs", () => {
	it("returns nothing when there's no package.json", () => {
		const project = createTempDir();
		try {
			assert.deepEqual(getImportsWatchDirs(project.path), []);
		} finally {
			project.cleanup();
		}
	});

	it("returns nothing when package.json has no imports field", () => {
		const project = createTempDir();
		try {
			writeFileSync(join(project.path, "package.json"), JSON.stringify({ name: "fixture" }));
			assert.deepEqual(getImportsWatchDirs(project.path), []);
		} finally {
			project.cleanup();
		}
	});

	it("skips an imports target that doesn't exist on disk", () => {
		const project = createTempDir();
		try {
			writeFileSync(
				join(project.path, "package.json"),
				JSON.stringify({ name: "fixture", imports: { "#/*": "./src/domain/*" } }),
			);
			assert.deepEqual(getImportsWatchDirs(project.path), []);
		} finally {
			project.cleanup();
		}
	});

	it("resolves each existing imports target to an absolute directory", () => {
		const project = createTempDir();
		try {
			mkdirSync(join(project.path, "src", "domain"), { recursive: true });
			mkdirSync(join(project.path, "lib"), { recursive: true });
			writeFileSync(
				join(project.path, "package.json"),
				JSON.stringify({
					name: "fixture",
					imports: { "#/*": "./src/domain/*", "#lib/*": "./lib/*" },
				}),
			);

			const dirs = getImportsWatchDirs(project.path);
			assert.deepEqual(new Set(dirs), new Set([join(project.path, "src", "domain"), join(project.path, "lib")]));
		} finally {
			project.cleanup();
		}
	});
});

describe("buildEntry", () => {
	it("bundles a route file, inlining relative imports and leaving bare specifiers external", async (t) => {
		const project = createTempDir();
		t.after(project.cleanup);

		const routesDir = join(project.path, "routes");
		mkdirSync(routesDir, { recursive: true });
		writeFileSync(join(project.path, "helper.ts"), 'export const greeting = "hello from a relative import";\n');
		writeFileSync(
			join(routesDir, "get.index.ts"),
			`
			import { defineRoute } from ${JSON.stringify(INDEX_PATH)};
			import { greeting } from "../helper.ts";
			import { z } from "zod";

			export default defineRoute({
				response: z.object({ greeting: z.string() }),
				handler: async () => ({ data: { greeting } }),
			});
			`,
		);

		const outDir = join(project.path, ".nrr");
		await buildEntry({ cwd: project.path, routesDir, outDir, port: 3000, allowOrigins: [] });

		const entry = readFileSync(getEntryPath(outDir), "utf8");
		assert.match(entry, /hello from a relative import/, "the relative import got inlined");
		assert.match(entry, /from\s*["']zod["']/, "the bare npm specifier stays external, not inlined");
	});

	it("inlines a project's own package.json #imports subpath alias instead of leaving it external", async (t) => {
		const project = createTempDir();
		t.after(project.cleanup);

		writeFileSync(
			join(project.path, "package.json"),
			JSON.stringify({ name: "fixture", type: "module", imports: { "#/*": "./src/domain/*" } }),
		);

		const routesDir = join(project.path, "routes");
		mkdirSync(routesDir, { recursive: true });
		mkdirSync(join(project.path, "src", "domain"), { recursive: true });
		writeFileSync(
			join(project.path, "src", "domain", "greeting.ts"),
			'export const greeting = "hello from a #/ import";\n',
		);
		writeFileSync(
			join(routesDir, "get.index.ts"),
			`
			import { defineRoute } from ${JSON.stringify(INDEX_PATH)};
			import { greeting } from "#/greeting.ts";
			import { z } from "zod";

			export default defineRoute({
				response: z.object({ greeting: z.string() }),
				handler: async () => ({ data: { greeting } }),
			});
			`,
		);

		const outDir = join(project.path, ".nrr");
		await buildEntry({ cwd: project.path, routesDir, outDir, port: 3000, allowOrigins: [] });

		const entry = readFileSync(getEntryPath(outDir), "utf8");
		assert.match(entry, /hello from a #\/ import/, "the #/-aliased import got inlined");
		assert.doesNotMatch(entry, /["']#\/greeting\.ts["']/, "no raw #/ specifier left for Node to resolve at runtime");
	});

	it("rejects a routes tree with a duplicate method+path", async (t) => {
		const project = createTempDir();
		t.after(project.cleanup);

		const routesDir = join(project.path, "routes");
		mkdirSync(join(routesDir, "(a)"), { recursive: true });
		mkdirSync(join(routesDir, "(b)"), { recursive: true });
		writeFileSync(join(routesDir, "(a)", "get.index.ts"), "export default {};\n");
		writeFileSync(join(routesDir, "(b)", "get.index.ts"), "export default {};\n");

		await assert.rejects(
			buildEntry({ cwd: project.path, routesDir, outDir: join(project.path, ".nrr"), port: 3000, allowOrigins: [] }),
			/Duplicate route/,
		);
	});
});
