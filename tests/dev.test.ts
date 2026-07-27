import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dev } from "../src/dev.ts";
import { createFixtureProject } from "./helpers/fixtureProject.ts";

const INDEX_PATH = fileURLToPath(new URL("../src/index.ts", import.meta.url));

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

const pollForMessage = async (port: number, expected: string): Promise<unknown> => {
	const deadline = Date.now() + 10_000;
	let lastMessage: unknown;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://localhost:${port}/`);
			const body = (await res.json()) as { message: unknown };
			lastMessage = body.message;
			if (body.message === expected) break;
		} catch {
			// server is mid-(re)start: either the initial spawn hasn't bound the port yet,
			// or the old process exited and the new one hasn't started listening yet
		}
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	return lastMessage;
};

describe("dev", () => {
	it("builds, serves requests, rebuilds on file change, and stops cleanly", async (t) => {
		const project = createFixtureProject();
		t.after(project.cleanup);

		const routesDir = join(project.path, "routes");
		mkdirSync(routesDir, { recursive: true });
		writeRoute(routesDir, "v1");

		const port = 41200 + Math.floor(Math.random() * 1000);
		const stop = await dev({
			cwd: project.path,
			routesDir,
			outDir: join(project.path, ".nrr"),
			port,
			allowOrigins: [],
		});
		t.after(stop);

		// dev() resolves once the child process is spawned, not once its server is listening
		const firstMessage = await pollForMessage(port, "v1");
		assert.equal(firstMessage, "v1");

		writeRoute(routesDir, "v2");

		// wait for the debounced watcher to rebuild and respawn the server
		const secondMessage = await pollForMessage(port, "v2");
		assert.equal(secondMessage, "v2");
	});

	it("rebuilds when a file reached via a package.json #imports alias changes, not just routesDir", async (t) => {
		const project = createFixtureProject();
		t.after(project.cleanup);

		writeFileSync(
			join(project.path, "package.json"),
			JSON.stringify({ name: "fixture", type: "module", imports: { "#/*": "./src/domain/*" } }),
		);

		const domainDir = join(project.path, "src", "domain");
		mkdirSync(domainDir, { recursive: true });
		writeFileSync(join(domainDir, "message.ts"), 'export const message = "v1";\n');

		const routesDir = join(project.path, "routes");
		mkdirSync(routesDir, { recursive: true });
		writeFileSync(
			join(routesDir, "get.index.ts"),
			`
			import { defineRoute } from ${JSON.stringify(INDEX_PATH)};
			import { message } from "#/message.ts";
			export default defineRoute({
				response: { safeParse: (d) => ({ success: true, data: d }) },
				handler: async () => ({ data: { message } }),
			});
			`,
		);

		const port = 45000 + Math.floor(Math.random() * 1000);
		const stop = await dev({
			cwd: project.path,
			routesDir,
			outDir: join(project.path, ".nrr"),
			port,
			allowOrigins: [],
		});
		t.after(stop);

		const firstMessage = await pollForMessage(port, "v1");
		assert.equal(firstMessage, "v1");

		// edit the #/-aliased file itself, not the route file - only the watcher covering
		// getImportsWatchDirs's directories can pick this up
		writeFileSync(join(domainDir, "message.ts"), 'export const message = "v2";\n');

		const secondMessage = await pollForMessage(port, "v2");
		assert.equal(secondMessage, "v2");
	});
});
