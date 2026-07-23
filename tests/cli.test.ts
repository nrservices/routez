import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "../src/constants.ts";
import { createFixtureProject } from "./helpers/fixtureProject.ts";
import { createTempDir } from "./helpers/tempDir.ts";

const CLI_PATH = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const INDEX_PATH = fileURLToPath(new URL("../src/index.ts", import.meta.url));

const runCli = (args: string[], cwd: string): { stdout: string; stderr: string; status: number } => {
	try {
		const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], { cwd, encoding: "utf8" });
		return { stdout, stderr: "", status: 0 };
	} catch (error) {
		const err = error as { stdout?: string; stderr?: string; status?: number | null };
		return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", status: err.status ?? 1 };
	}
};

const writeRoute = (routesDir: string, message: string): void => {
	writeFileSync(
		join(routesDir, "get.index.ts"),
		`
		import { defineRoute } from ${JSON.stringify(INDEX_PATH)};
		export default defineRoute({
			response: { safeParse: (d) => ({ success: true, data: d }) },
			handler: async () => ({ data: { message: ${JSON.stringify(message)} } }),
		});
		`,
	);
};

const waitForExit = (child: ChildProcess): Promise<number | null> =>
	new Promise((resolvePromise) => child.once("exit", (code) => resolvePromise(code)));

const pollUntilUp = async (port: number): Promise<void> => {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://localhost:${port}/`);
			if (res.ok) return;
		} catch {
			// server hasn't bound the port yet
		}
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
	}
	throw new Error(`server on port ${port} never came up`);
};

describe("cli", () => {
	it("prints usage and exits 0 when called with no command", (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);

		const { stdout, status } = runCli([], dir.path);
		assert.match(stdout, new RegExp(`Usage: ${PACKAGE_NAME} <command>`));
		assert.equal(status, 0);
	});

	it("prints usage and exits 1 for an unknown command", (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);

		const { stdout, status } = runCli(["frobnicate"], dir.path);
		assert.match(stdout, new RegExp(`Usage: ${PACKAGE_NAME} <command>`));
		assert.equal(status, 1);
	});

	it("build produces an entry.js for a fixture project", (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);

		mkdirSync(join(dir.path, "routes"));
		writeFileSync(
			join(dir.path, "routes", "get.index.ts"),
			`
			import { defineRoute } from ${JSON.stringify(INDEX_PATH)};
			export default defineRoute({
				response: { safeParse: (d) => ({ success: true, data: d }) },
				handler: async () => ({ data: {} }),
			});
			`,
		);

		const { status } = runCli(["build"], dir.path);
		assert.equal(status, 0);
		assert.ok(existsSync(join(dir.path, ".nrr", "entry.js")));
	});

	it("start exits with a clear error when no build exists yet", (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);

		const { stderr, status } = runCli(["start"], dir.path);
		assert.equal(status, 1);
		assert.match(stderr, /No build found/);
	});

	it("start runs a previously built entry and stops cleanly on SIGTERM", async (t) => {
		const project = createFixtureProject();
		t.after(project.cleanup);

		const routesDir = join(project.path, "routes");
		mkdirSync(routesDir);
		writeRoute(routesDir, "hello-start");

		const port = 41800 + Math.floor(Math.random() * 1000);
		const build = runCli(["build", "--port", String(port)], project.path);
		assert.equal(build.status, 0);

		const child = spawn(process.execPath, [CLI_PATH, "start"], { cwd: project.path, stdio: "ignore" });
		t.after(() => {
			if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
		});

		await pollUntilUp(port);
		const res = await fetch(`http://localhost:${port}/`);
		assert.deepEqual(await res.json(), { message: "hello-start" });

		child.kill("SIGTERM");
		const code = await waitForExit(child);
		assert.equal(code, 0);
	});

	it("dev starts the server via the CLI and stops cleanly on SIGTERM", async (t) => {
		const project = createFixtureProject();
		t.after(project.cleanup);

		const routesDir = join(project.path, "routes");
		mkdirSync(routesDir);
		writeRoute(routesDir, "hello-dev");

		const port = 41900 + Math.floor(Math.random() * 1000);
		const child = spawn(process.execPath, [CLI_PATH, "dev", "--port", String(port)], {
			cwd: project.path,
			stdio: "ignore",
		});
		t.after(() => {
			if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
		});

		await pollUntilUp(port);
		const res = await fetch(`http://localhost:${port}/`);
		assert.deepEqual(await res.json(), { message: "hello-dev" });

		child.kill("SIGTERM");
		const code = await waitForExit(child);
		assert.equal(code, 0);
	});
});
