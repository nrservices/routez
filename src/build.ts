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
 * extensions, tsconfig-style aliases and any TS-authored generated code (e.g. Prisma) the
 * same way it already resolves this package's own entry - a bare Node `import()` cannot.
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

	const config = { port: opt.port, allowOrigins: opt.allowOrigins };

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
 * Only relative or absolute specifiers (the target's own source, plus this package's already
 * pre-built runtime.js) are actually resolved and bundled by rolldown.
 */
const isExternal = (id: string, opt: BuildOptions): boolean => {
	if (!id.startsWith(".") && !isAbsolute(id)) return true;
	return opt.external?.some((pattern) => (typeof pattern === "string" ? id === pattern : pattern.test(id))) ?? false;
};
