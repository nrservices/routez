/**
 * The package's public name - the single place to update if it ever changes. Everything
 * derived from it (marker symbols, default config file name, CLI usage text) follows along.
 */
export const PACKAGE_NAME = "restez";

/**
 * File-based routing convention: `get.index.ts`, `post.$id.ts`, etc. The negative
 * lookahead excludes co-located test files (`get.index.test.ts`) - without it, a route's
 * own test file matches this pattern too and gets scanned as if it were a route.
 */
export const ROUTE_FILE_PATTERN = /^(get|post|put|patch|delete|head|options)\.(?!.*\.test\.ts$)(.+)\.ts$/;

/**
 * File-based routing convention: `_hook.logger.ts` - applies to every route in its
 * directory and below.
 */
export const HOOK_FILE_PATTERN = /^_hook\.(.+)\.ts$/;

/**
 * Virtual module id `dev.ts` generates route-bundling code under, and its resolved
 * (null-byte prefixed) counterpart - the Rollup/rolldown convention for marking a module
 * id as virtual so no other plugin tries to resolve it as a real file.
 */
export const VIRTUAL_ENTRY_ID = "virtual:nrr-entry";
export const RESOLVED_VIRTUAL_ENTRY_ID = `\0${VIRTUAL_ENTRY_ID}`;

/**
 * Not re-exported from the package's public entry point, but deliberately created with
 * `Symbol.for` (the process-wide registry) rather than a bare `Symbol()`: `dev.ts`'s watch
 * pipeline re-bundles this module's code (inlined into the generated virtual entry) on top
 * of the copy Node loads natively when a route file imports `defineRoute` - two separate
 * evaluations of this module in the same process. A bare `Symbol()` would produce two
 * unequal values across those evaluations, so a route built by the "real" `defineRoute`
 * would always fail the marker check performed by the inlined copy. `Symbol.for` returns
 * the same value for the same key everywhere in the process regardless of how many times
 * the module is re-evaluated.
 */
export const ROUTE_HANDLER_MARKER = Symbol.for(`${PACKAGE_NAME}:route-handler`);

/** Same `Symbol.for` reasoning as ROUTE_HANDLER_MARKER, applied to `defineHook`'s output. */
export const HOOK_HANDLER_MARKER = Symbol.for(`${PACKAGE_NAME}:hook-handler`);

/**
 * Same duplicate-evaluation problem as ROUTE_HANDLER_MARKER, but for a stateful object rather
 * than a marker value: `context.ts`'s `AsyncLocalStorage` instance would otherwise exist once
 * per bundle this package is built into (`index.js`, imported by route/hook files via
 * `import ... from "restez"`, vs `runtime.js`, which establishes the context around
 * hooks+handler in `composeRoute`) - two unrelated stores, so data set from one is invisible
 * to the other. `Symbol.for` gives every copy the same `globalThis` key to store/retrieve the
 * one real instance under, so all bundles share it regardless of how many times the module
 * carrying `new AsyncLocalStorage()` is re-evaluated.
 */
export const ASYNC_LOCAL_STORAGE_KEY = Symbol.for(`${PACKAGE_NAME}:async-local-storage`);

/** Same `Symbol.for`/`globalThis` reasoning as ASYNC_LOCAL_STORAGE_KEY, applied to the default logger. */
export const LOGGER_KEY = Symbol.for(`${PACKAGE_NAME}:logger`);

/**
 * Config file convention: `<package-name>.config.ts` at the target project's root. See
 * config.ts - falls back to reading ENV_FILE_NAME when absent.
 */
export const CONFIG_FILE_NAME = `${PACKAGE_NAME}.config.ts`;

/** `.env` file read from the target project's root by config.ts when CONFIG_FILE_NAME is absent. */
export const ENV_FILE_NAME = ".env";
