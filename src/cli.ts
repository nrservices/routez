#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { buildEntry, getEntryPath } from "./build.ts";
import { loadConfig } from "./config.ts";
import { PACKAGE_NAME } from "./constants.ts";
import { dev } from "./dev.ts";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		routesDir: { type: "string" },
		outDir: { type: "string" },
		port: { type: "string" },
	},
});

const DEFAULT_ROUTES_DIR = "./routes";
const DEFAULT_OUT_DIR = `.${PACKAGE_NAME}`;
const DEFAULT_PORT = 3000;
const COMMANDS = ["dev", "build", "start"] as const;

const USAGE = `Usage: ${PACKAGE_NAME} <command> [options]

Commands:
  dev      Start the dev server, rebuilding on every file change
  build    Bundle the app once, without starting it
  start    Run a build produced by "${PACKAGE_NAME} build"

Options:
  --routesDir <dir>   Routes directory (default: "${DEFAULT_ROUTES_DIR}")
  --outDir <dir>      Build output directory (default: "${DEFAULT_OUT_DIR}")
  --port <port>       Server port (default: ${DEFAULT_PORT})
`;

const main = async (): Promise<void> => {
	const command = positionals[0];

	if (!command || !(COMMANDS as readonly string[]).includes(command)) {
		console.log(USAGE);
		process.exitCode = command ? 1 : 0;
		return;
	}

	const cwd = process.cwd();
	const config = await loadConfig(cwd);

	const routesDir = resolve(cwd, values.routesDir ?? config.routesDir ?? DEFAULT_ROUTES_DIR);
	const outDir = resolve(cwd, values.outDir ?? config.outDir ?? DEFAULT_OUT_DIR);
	const port = Number(values.port ?? config.port ?? DEFAULT_PORT);
	const allowOrigins = config.allowOrigins ?? [];
	const { bodyLimit, requestTimeout } = config;

	if (command === "dev") {
		const stop = await dev({ cwd, routesDir, outDir, port, allowOrigins, bodyLimit, requestTimeout });
		const shutdown = async (): Promise<void> => {
			await stop();
			process.exit(0);
		};
		process.once("SIGINT", shutdown);
		process.once("SIGTERM", shutdown);
		return;
	}

	if (command === "build") {
		await buildEntry({ cwd, routesDir, outDir, port, allowOrigins, bodyLimit, requestTimeout });
		return;
	}

	if (command === "start") {
		const entryPath = getEntryPath(outDir);
		if (!existsSync(entryPath)) {
			throw new Error(`No build found at "${entryPath}" - run \`${PACKAGE_NAME} build\` first.`);
		}
		await import(pathToFileURL(entryPath).href);
		return;
	}
};

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
