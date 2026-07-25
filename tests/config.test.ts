import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defineConfig, loadConfig } from "../src/config.ts";
import { CONFIG_FILE_NAME } from "../src/constants.ts";
import { createTempDir } from "./helpers/tempDir.ts";

describe("defineConfig", () => {
	it("returns the config unchanged (identity, for type inference only)", () => {
		const config = { port: 1234 };
		assert.equal(defineConfig(config), config);
	});

	it("accepts the string/undefined shape process.env values have", () => {
		const config = defineConfig({ port: process.env.SOME_UNSET_PORT, allowOrigins: process.env.SOME_UNSET_ORIGIN });
		assert.equal(config.port, undefined);
		assert.equal(config.allowOrigins, undefined);
	});
});

describe("loadConfig", () => {
	let originalPort: string | undefined;
	let originalOrigins: string | undefined;

	beforeEach(() => {
		originalPort = process.env.PORT;
		originalOrigins = process.env.ALLOW_ORIGIN;
	});

	afterEach(() => {
		if (originalPort === undefined) delete process.env.PORT;
		else process.env.PORT = originalPort;
		if (originalOrigins === undefined) delete process.env.ALLOW_ORIGIN;
		else process.env.ALLOW_ORIGIN = originalOrigins;
	});

	it("derives port/allowOrigins from process.env when nothing else is present", async (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		process.env.PORT = "4321";
		process.env.ALLOW_ORIGIN = "https://a.com, https://b.com";

		const config = await loadConfig(dir.path);
		assert.equal(config.port, 4321);
		assert.deepEqual(config.allowOrigins, ["https://a.com", "https://b.com"]);
	});

	it("loads PORT/ALLOW_ORIGIN from a .env file at the project root", async (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		writeFileSync(join(dir.path, ".env"), "PORT=5555\nALLOW_ORIGIN=https://example.com\n");

		const config = await loadConfig(dir.path);
		assert.equal(config.port, 5555);
		assert.deepEqual(config.allowOrigins, ["https://example.com"]);
	});

	it("merges a config file over env-derived values instead of replacing them", async (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		writeFileSync(join(dir.path, ".env"), "PORT=6000\n");
		writeFileSync(join(dir.path, CONFIG_FILE_NAME), 'export default { outDir: "./custom-out" };\n');

		const config = await loadConfig(dir.path);
		assert.equal(config.port, 6000, "PORT from .env survives even though the config file didn't mention it");
		assert.equal(config.outDir, "./custom-out", "the config file's own field is applied");
	});

	it("lets a config file's field take priority over the env-derived one", async (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		writeFileSync(join(dir.path, ".env"), "PORT=6000\n");
		writeFileSync(join(dir.path, CONFIG_FILE_NAME), "export default { port: 7000 };\n");

		const config = await loadConfig(dir.path);
		assert.equal(config.port, 7000);
	});

	it("coerces a string port from a config file (e.g. forwarded from process.env.PORT)", async (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		writeFileSync(join(dir.path, CONFIG_FILE_NAME), 'export default { port: "7000" };\n');

		const config = await loadConfig(dir.path);
		assert.equal(config.port, 7000);
	});

	it("splits a comma-separated allowOrigins string from a config file", async (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		writeFileSync(
			join(dir.path, CONFIG_FILE_NAME),
			'export default { allowOrigins: "https://a.com,https://b.com" };\n',
		);

		const config = await loadConfig(dir.path);
		assert.deepEqual(config.allowOrigins, ["https://a.com", "https://b.com"]);
	});

	it("coerces string bodyLimit/requestTimeout from a config file", async (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		writeFileSync(
			join(dir.path, CONFIG_FILE_NAME),
			'export default { bodyLimit: "2097152", requestTimeout: "5000" };\n',
		);

		const config = await loadConfig(dir.path);
		assert.equal(config.bodyLimit, 2097152);
		assert.equal(config.requestTimeout, 5000);
	});

	it("falls through to the env-derived port when a config file sets it to undefined", async (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		writeFileSync(join(dir.path, ".env"), "PORT=6000\n");
		writeFileSync(join(dir.path, CONFIG_FILE_NAME), "export default { port: undefined };\n");

		const config = await loadConfig(dir.path);
		assert.equal(config.port, undefined, "an explicit undefined in the config file overrides the .env value");
	});
});
