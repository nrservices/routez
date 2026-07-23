import { HOOK_HANDLER_MARKER } from "./constants.ts";
import type { RouteResult } from "./defineRoute.ts";
import type { RequestLike } from "./request.ts";

/**
 * Returning a `RouteResult` stops the chain and sends that result as the response, skipping
 * every remaining hook and the route handler. Returning nothing (`undefined`) lets the chain continue.
 */
export type HookHandler = (req: RequestLike) => Promise<RouteResult | undefined>;

export function isHookHandler(value: unknown): value is HookHandler {
	return typeof value === "function" && (value as unknown as Record<symbol, unknown>)[HOOK_HANDLER_MARKER] === true;
}

export function defineHook(handler: HookHandler): HookHandler {
	return Object.defineProperty(handler, HOOK_HANDLER_MARKER, {
		value: true,
		enumerable: false,
		writable: false,
		configurable: false,
	}) as HookHandler;
}
