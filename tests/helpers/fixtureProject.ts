import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTempDir, type TempDir } from "./tempDir.ts";

/** Packages runtime.ts's source imports directly - not needed once a project runs on the built dist (fully bundled), but this repo's own tests exercise `src/` directly. */
const REQUIRED_PACKAGES = ["fastify", "@fastify/cors", "@fastify/helmet", "@fastify/cookie", "pino", "nanoid"];

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * A temp project directory outside this repo, with symlinks back to this repo's own
 * node_modules for the packages a spawned entry.js needs at runtime. Needed by any test that
 * actually executes a bundled entry.js in a real child process (dev.ts) rather than just
 * inspecting the bundle's contents.
 */
export const createFixtureProject = (): TempDir => {
	const dir = createTempDir();
	writeFileSync(join(dir.path, "package.json"), JSON.stringify({ name: "fixture", type: "module" }));

	for (const pkg of REQUIRED_PACKAGES) {
		const target = join(REPO_ROOT, "node_modules", pkg);
		const linkPath = join(dir.path, "node_modules", pkg);
		mkdirSync(dirname(linkPath), { recursive: true });
		symlinkSync(target, linkPath, "dir");
	}

	return dir;
};
