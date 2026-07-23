import { AsyncLocalStorage } from "node:async_hooks";
import { ASYNC_LOCAL_STORAGE_KEY } from "./constants.ts";
import { getGlobalSingleton } from "./utils/globalSingleton.ts";

export interface RequestContext {
	readonly requestId: string;
	readonly data: Map<string, unknown>;
}

/**
 * Empty by default - augment via `declare module` in a consuming project to type values
 * stored in a request's context `data` (see `setContextData`/`getContextData`). `data` stays
 * a plain `Map` at runtime; this interface only exists to type keys/values read back out of it.
 */
// biome-ignore lint/suspicious/noEmptyInterface: intentionally augmentable via `declare module`
export interface RequestContextData {}

const storage = getGlobalSingleton(ASYNC_LOCAL_STORAGE_KEY, () => new AsyncLocalStorage<RequestContext>());

export function runInContext<T>(context: Omit<RequestContext, "data">, fn: () => T): T {
	return storage.run(Object.freeze({ ...context, data: new Map() }), fn);
}

export function getContext(): RequestContext {
	const context = storage.getStore();
	if (!context) {
		throw new Error("getContext() must be called within a request execution context");
	}
	return context;
}

/**
 * `RequestContext.data` is a plain, untyped `Map` because the context object itself is
 * frozen at creation - this is the one mutable channel hooks and handlers share within a
 * request. `setContextData`/`getContextData` add type safety on top of it, keyed by the
 * `RequestContextData` interface a consuming project augments via `declare module`.
 */
export function setContextData<K extends keyof RequestContextData>(key: K, value: RequestContextData[K]): void {
	getContext().data.set(key as string, value);
}

export function getContextData<K extends keyof RequestContextData>(key: K): RequestContextData[K] | undefined {
	return getContext().data.get(key as string) as RequestContextData[K] | undefined;
}
