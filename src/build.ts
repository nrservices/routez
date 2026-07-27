import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "rolldown";
import { build } from "rolldown";
import { RESOLVED_VIRTUAL_ENTRY_ID, VIRTUAL_ENTRY_ID } from "./constants.ts";
import { assertNoDuplicateRoutes, walk } from "./scan.ts";

export interface BuildOptions {
	cwd: string;
	routesDir: string;
	outDir: string;
	port: number;
	allowOrigins?: string[];
	bodyLimit?: number;
	requestTimeout?: number;
	external?: (string | RegExp)[];
}

const RUNTIME_ENTRY_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "runtime.js");
export const ENTRY_FILE_NAME = "entry.js";

export const getEntryPath = (outDir: string): string => join(outDir, ENTRY_FILE_NAME);

/**
 * Bundles the target project's routes/hooks (discovered by `walk`) plus this package's own
 * runtime into a single entry file at `getEntryPath(opt.outDir)`. Shared by `dev` (rebuilt on
 * every file change) and the one-shot `build` CLI command.
 */
export async function buildEntry(opt: BuildOptions): Promise<void> {
	await build({
		input: VIRTUAL_ENTRY_ID,
		platform: "node",
		plugins: [virtualEntryPlugin(opt)],
		external: (id) => isExternal(id, opt),
		output: { dir: opt.outDir, format: "esm", cleanDir: true, entryFileNames: ENTRY_FILE_NAME },
	});
}

const virtualEntryPlugin = (opt: BuildOptions): Plugin => ({
	name: "nrr-virtual-entry",
	resolveId(id) {
		if (id === VIRTUAL_ENTRY_ID) {
			return RESOLVED_VIRTUAL_ENTRY_ID;
		}
	},
	load(id) {
		if (id === RESOLVED_VIRTUAL_ENTRY_ID) {
			return generateEntrySource(opt);
		}
	},
});

/**
 * Discovers routes/hooks (walking `opt.routesDir`) and emits source that statically imports
 * each one by its real file path, instead of `runtime.ts` dynamically `import()`-ing raw
 * source at request-serving time. Static imports let rolldown's own resolver handle
 * extensions, a project's own package.json `imports` subpath aliases (see `isExternal`) and
 * any TS-authored generated code (e.g. Prisma) the same way it already resolves this
 * package's own entry - a bare Node `import()` cannot. Note this is Node's native `imports`
 * field, not TypeScript's `compilerOptions.paths` - the latter is a type-checking-only
 * concept with no runtime meaning, and isn't resolved here or anywhere else in this package.
 */
const generateEntrySource = (opt: BuildOptions): string => {
	const discovered = walk(opt.routesDir);
	assertNoDuplicateRoutes(discovered);

	const importIdentifiers = new Map<string, string>();
	const importFor = (filePath: string): string => {
		const existing = importIdentifiers.get(filePath);
		if (existing) return existing;
		const identifier = `mod${importIdentifiers.size}`;
		importIdentifiers.set(filePath, identifier);
		return identifier;
	};

	for (const route of discovered) {
		importFor(route.filePath);
		for (const hookPath of route.hooks) importFor(hookPath);
	}

	const imports = [...importIdentifiers.entries()].map(
		([filePath, identifier]) => `import ${identifier} from ${JSON.stringify(filePath)};`,
	);

	const routeEntries = discovered.map((route) => {
		const hookEntries = route.hooks.map((hookPath) => `[${JSON.stringify(hookPath)}, ${importFor(hookPath)}]`);
		const handlerIdentifier = importFor(route.filePath);
		return `{ method: ${JSON.stringify(route.method)}, url: ${JSON.stringify(route.routePath)}, handler: composeRoute(${JSON.stringify(route.filePath)}, ${handlerIdentifier}, [${hookEntries.join(", ")}]) }`;
	});

	const config = {
		port: opt.port,
		allowOrigins: opt.allowOrigins,
		bodyLimit: opt.bodyLimit,
		requestTimeout: opt.requestTimeout,
	};

	return `
		import { start, composeRoute, loadConfig, logger as defaultLogger } from ${JSON.stringify(RUNTIME_ENTRY_PATH)};
		${imports.join("\n")}

		try {
			const { logger } = await loadConfig(${JSON.stringify(opt.cwd)});
			// Same fallback \`start()\` applies internally to its own \`logger\` option - needed here too
			// since \`loadConfig\`'s \`logger\` is only set when a project's config file provides one.
			const log = logger ?? defaultLogger;

			// Last-resort net for anything that escapes a request's own lifecycle (a fire-and-forget
			// rejection, a throw inside a timer callback, ...) - Node's default behavior otherwise is
			// to kill the process with a raw stack trace on stderr, no structured log entry, taking
			// every in-flight request down with it silently.
			process.on("uncaughtException", (err) => {
				log.error({ err }, "uncaughtException");
				process.exit(1);
			});
			process.on("unhandledRejection", (reason) => {
				log.error({ err: reason }, "unhandledRejection");
				process.exit(1);
			});

			const { stop } = await start({ ...${JSON.stringify(config)}, logger, routes: [${routeEntries.join(", ")}] });

			const shutdown = async () => {
				await stop();
				process.exit(0);
			};

			process.once("SIGTERM", shutdown);
			process.once("SIGINT", shutdown);
		} catch (err) {
			console.error(err);
			process.exit(1);
		}
	`;
};

/**
 * Bare specifiers (npm packages: "zod", "fastify", "@prisma/client", ...) stay external -
 * resolved normally by Node from the target project's own `node_modules` at runtime - so a
 * rebuild only re-bundles the target's own route/hook files, not their entire dependency
 * tree (which would also risk breaking native addons/dynamic requires bundlers choke on).
 * Relative specifiers, absolute paths (the target's own source, plus this package's already
 * pre-built runtime.js) and `#`-prefixed ones (a project's own package.json `imports` subpath
 * aliases - not a third-party dependency, even though the bare-looking syntax says otherwise)
 * are all resolved and bundled by rolldown instead: the target's own code should never need to
 * exist on disk next to the built `entry.js` for it to run.
 */
const isExternal = (id: string, opt: BuildOptions): boolean => {
	if (!id.startsWith(".") && !id.startsWith("#") && !isAbsolute(id)) return true;
	return opt.external?.some((pattern) => (typeof pattern === "string" ? id === pattern : pattern.test(id))) ?? false;
};

/**
 * Directories a project's own package.json `imports` field (`#foo/*"` subpath aliases) points
 * at - now that `isExternal` bundles those instead of leaving them for Node to resolve at
 * runtime, `dev`'s file watcher needs to know about them too, or editing an aliased file
 * wouldn't trigger a rebuild at all (unlike before, when Node re-read it fresh from disk on
 * every process restart regardless of any watcher). Read directly from package.json rather than
 * assuming any particular layout - a project's own alias targets can be anything.
 */
export const getImportsWatchDirs = (cwd: string): string[] => {
	const packageJsonPath = join(cwd, "package.json");
	if (!existsSync(packageJsonPath)) return [];

	const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { imports?: Record<string, unknown> };
	if (!pkg.imports) return [];

	const dirs = new Set<string>();
	for (const target of Object.values(pkg.imports)) {
		if (typeof target !== "string") continue;
		const dir = resolve(cwd, target.replace(/\*$/, ""));
		if (existsSync(dir)) dirs.add(dir);
	}

	return [...dirs];
};
