import { type ChildProcess, spawn } from "node:child_process";
import { watch } from "node:fs";
import { type BuildOptions, buildEntry, getEntryPath } from "./build.ts";
import { createRunner } from "./utils/createRunner.ts";
import { debounce } from "./utils/debounce.ts";
import { tryCatch } from "./utils/tryCatch.ts";

export type DevOptions = BuildOptions;

const KILL_TIMEOUT_MS = 5_000;

/**
 * A single logical file save routinely fires several `fs.watch` events in a row (editors
 * write-then-rename, recursive watch can double-report). Without debouncing, the resulting
 * back-to-back rebuilds race: `cleanDir` from the second build can wipe the entry file while
 * the child process spawned by the first build is still resolving it, crashing with
 * MODULE_NOT_FOUND.
 */
const WATCH_DEBOUNCE_MS = 50;

export const dev = async (opt: DevOptions) => {
	let stop: (() => Promise<void>) | undefined;

	const runner = createRunner(async () => {
		stop = await buildAndStart(opt, stop);
	});

	const fsWatcher = watch(opt.routesDir, { recursive: true }, debounce(runner.schedule, WATCH_DEBOUNCE_MS));
	await runner.schedule();

	return async () => {
		fsWatcher.close();
		await runner.idle();
		await stop?.();
	};
};

const spawnServer = (entryPath: string) => {
	const childProcess = spawn(process.execPath, [entryPath], { stdio: "inherit" });
	return stopServer(childProcess);
};

const stopServer = (child: ChildProcess | null) => (): Promise<void> => {
	if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

	return new Promise((resolvePromise) => {
		const killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_TIMEOUT_MS);
		child.once("exit", () => {
			clearTimeout(killTimer);
			resolvePromise();
		});
		child.kill("SIGTERM");
	});
};

const buildAndStart = async (opt: DevOptions, stop: (() => Promise<void>) | undefined) => {
	const [, err] = await tryCatch<void>(() => buildEntry(opt));

	await stop?.();

	if (err) {
		console.log(err);
		return;
	}

	return spawnServer(getEntryPath(opt.outDir));
};
