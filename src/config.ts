import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CONFIG_FILE_NAME, ENV_FILE_NAME } from "./constants.ts";
import type { Logger } from "./logger.ts";
import { parseAllowOrigins } from "./utils/parseAllowOrigins.ts";

export interface RoutingConfig {
	routesDir?: string;
	outDir?: string;
	port?: number;
	allowOrigins?: string[];
	/** Overrides the default logger entirely - build your own `pino(...)` instance (custom transport, etc.) and hand it here. */
	logger?: Logger;
}

export function defineConfig(config: RoutingConfig): RoutingConfig {
	return config;
}

/**
 * Loads the target project's config: values derived from `process.env` (itself populated
 * from the project's `.env` file, if present), overridden field by field by
 * `<package-name>.config.ts` at `cwd` when present - so e.g. a config file that only sets
 * `logger` doesn't silently drop a `.env`-provided `PORT`.
 */
export async function loadConfig(cwd: string): Promise<RoutingConfig> {
	loadEnvFile(cwd);

	const envConfig = configFromEnv();

	const configPath = join(cwd, CONFIG_FILE_NAME);
	if (existsSync(configPath)) {
		const module = (await import(pathToFileURL(configPath).href)) as { default?: RoutingConfig };
		return { ...envConfig, ...module.default };
	}

	return envConfig;
}

const loadEnvFile = (cwd: string): void => {
	const envPath = join(cwd, ENV_FILE_NAME);
	if (existsSync(envPath)) {
		process.loadEnvFile(envPath);
	}
};

const configFromEnv = (): RoutingConfig => ({
	port: process.env.PORT ? Number(process.env.PORT) : undefined,
	allowOrigins: parseAllowOrigins(process.env.ALLOW_ORIGIN),
});
