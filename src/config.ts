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

/**
 * `defineConfig`'s input shape - same as `RoutingConfig`, except `port`/`allowOrigins` also
 * accept the raw `string | undefined` shape `process.env.X` has, so a config file can forward
 * an env var directly (`port: process.env.PORT`) without parsing it by hand first. `loadConfig`
 * normalizes this down to `RoutingConfig` after the config file is loaded.
 */
export interface RoutingConfigInput extends Omit<RoutingConfig, "port" | "allowOrigins"> {
	port?: number | string;
	allowOrigins?: string | string[];
}

export function defineConfig(config: RoutingConfigInput): RoutingConfigInput {
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
		const module = (await import(pathToFileURL(configPath).href)) as { default?: RoutingConfigInput };
		return { ...envConfig, ...normalizeConfigInput(module.default) };
	}

	return envConfig;
}

/**
 * Only touches `port`/`allowOrigins` on the returned object when the input actually set them -
 * an absent key must stay absent, so the `{ ...envConfig, ...normalized }` merge above doesn't
 * clobber an env/`.env`-derived value with an explicit `undefined` just because the config file
 * didn't mention that field at all.
 */
const normalizeConfigInput = (input: RoutingConfigInput = {}): RoutingConfig => {
	const { port, allowOrigins, ...rest } = input;
	const config: RoutingConfig = rest;

	if ("port" in input) config.port = port === undefined ? undefined : Number(port);
	if ("allowOrigins" in input) config.allowOrigins = parseAllowOrigins(allowOrigins);

	return config;
};

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
