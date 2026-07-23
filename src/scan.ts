import { readdirSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { HOOK_FILE_PATTERN, ROUTE_FILE_PATTERN } from "./constants.ts";
import { runInContext } from "./context.ts";
import { isHookHandler } from "./defineHook.ts";
import { isRouteHandler, type RouteResult } from "./defineRoute.ts";
import { buildRoutePath } from "./path.ts";
import type { RequestLike } from "./request.ts";

export interface ComposeRouteOptions {
	/**
	 * Supplied by the adapter (e.g. `runtime.ts` reusing Fastify's own `req.id`), not generated
	 * from inside a request - this is what lets an adapter unify its own request-id scheme with
	 * this package's, or propagate one received from an upstream proxy. Falls back to a fresh
	 * `nanoid()` when omitted.
	 */
	requestId?: string | number;
}

export type ComposedRouteHandler = (req: RequestLike, options?: ComposeRouteOptions) => Promise<RouteResult>;

export interface Route {
	method: string;
	url: string;
	handler: ComposedRouteHandler;
}

export interface DiscoveredRoute {
	method: string;
	routePath: string;
	filePath: string;
	hooks: string[];
}

/**
 * Walks `dir` for route/hook files by naming convention. Pure filesystem discovery, meant to
 * run at build time (see dev.ts's codegen) - it does not import the discovered files itself;
 * the caller statically imports them (so a bundler resolves aliases/extensions/generated
 * code correctly) and turns each result into a `Route` via `composeRoute`.
 */
export const walk = (dir: string, segments: string[] = [], ancestorHooks: string[][] = []): DiscoveredRoute[] => {
	const entries = readdirSync(dir, { withFileTypes: true });

	const hookFiles = entries
		.filter((entry) => entry.isFile() && HOOK_FILE_PATTERN.test(entry.name))
		.map((entry) => entry.name)
		.sort()
		.map((name) => join(dir, name));

	const currentHooks = [...ancestorHooks, hookFiles];

	const routes = entries
		.filter((entry) => entry.isFile())
		.flatMap((entry): DiscoveredRoute[] => {
			const match = ROUTE_FILE_PATTERN.exec(entry.name);
			if (!match) return [];

			const [, verb, rawFileNameSegments] = match;
			return [
				{
					method: (verb as string).toUpperCase(),
					routePath: buildRoutePath(segments, rawFileNameSegments?.split(".")),
					filePath: join(dir, entry.name),
					hooks: currentHooks.flat(),
				},
			];
		});

	const childRoutes = entries
		.filter((entry) => entry.isDirectory())
		.flatMap((entry) => walk(join(dir, entry.name), [...segments, entry.name], currentHooks));

	return [...routes, ...childRoutes];
};

export const assertNoDuplicateRoutes = (routes: DiscoveredRoute[]): void => {
	routes.reduce((seen, route) => {
		const key = `${route.method} ${route.routePath}`;
		const existing = seen.get(key);
		if (existing) {
			throw new Error(`Duplicate route for ${key}: "${existing}" and "${route.filePath}"`);
		}
		return seen.set(key, route.filePath);
	}, new Map<string, string>());
};

/**
 * Composes a route's hooks and handler from already-imported values - resolved and bundled
 * by the caller (dev.ts's codegen) rather than dynamically imported here. `handlerPath` and
 * the paths inside `hooks` are only used for error messages when a file forgot to wrap its
 * default export with `defineRoute`/`defineHook`.
 */
export function composeRoute(
	handlerPath: string,
	handler: unknown,
	hooks: [hookPath: string, hook: unknown][],
): ComposedRouteHandler {
	if (!isRouteHandler(handler)) {
		throw new Error(
			`Route file "${handlerPath}" does not export a valid route handler as its default export - did you forget to wrap it with defineRoute()?`,
		);
	}

	const validatedHooks = hooks.map(([hookPath, hook]) => {
		if (!isHookHandler(hook)) {
			throw new Error(
				`Hook file "${hookPath}" does not export a valid hook handler as its default export - did you forget to wrap it with defineHook()?`,
			);
		}
		return hook;
	});

	return (req: RequestLike, options?: ComposeRouteOptions) =>
		runInContext({ requestId: String(options?.requestId ?? nanoid()) }, async () => {
			for (const hook of validatedHooks) {
				const result = await hook(req);
				if (result) return result;
			}
			return handler(req);
		});
}
