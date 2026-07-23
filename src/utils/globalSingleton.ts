/**
 * Shares a value across every separately-bundled copy of the module that creates it (this
 * package builds several independent entry points - index.js, runtime.js, cli.js - so a plain
 * module-level `const x = ...` gets re-evaluated once per bundle instead of once per process).
 * `globalThis` is the one namespace every copy actually shares; `key` should be a
 * `Symbol.for(...)` value so unrelated bundles agree on the exact same slot.
 */
export function getGlobalSingleton<T>(key: symbol, create: () => T): T {
	const registry = globalThis as unknown as Record<symbol, T | undefined>;
	const existing = registry[key];
	if (existing !== undefined) return existing;

	const value = create();
	registry[key] = value;
	return value;
}
