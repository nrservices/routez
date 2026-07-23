import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { z } from "zod";
import { getContext } from "../src/context.ts";
import { defineHook } from "../src/defineHook.ts";
import { defineRoute } from "../src/defineRoute.ts";
import type { RequestLike } from "../src/request.ts";
import { assertNoDuplicateRoutes, composeRoute, walk } from "../src/scan.ts";
import { createTempDir } from "./helpers/tempDir.ts";

const baseReq: RequestLike = { headers: {} };

describe("walk", () => {
	it("discovers a flat route file", (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		writeFileSync(join(dir.path, "get.index.ts"), "");

		const routes = walk(dir.path);
		assert.equal(routes.length, 1);
		const [route] = routes;
		assert.ok(route);
		assert.equal(route.method, "GET");
		assert.equal(route.routePath, "/");
		assert.equal(route.filePath, join(dir.path, "get.index.ts"));
		assert.deepEqual(route.hooks, []);
	});

	it("builds nested route paths from folder segments, including $params", (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		mkdirSync(join(dir.path, "users", "$id"), { recursive: true });
		writeFileSync(join(dir.path, "users", "$id", "get.index.ts"), "");

		const routes = walk(dir.path);
		assert.equal(routes.length, 1);
		const [route] = routes;
		assert.ok(route);
		assert.equal(route.routePath, "/users/:id");
	});

	it("ignores files that don't match the route naming convention", (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		writeFileSync(join(dir.path, "get.index.ts"), "");
		writeFileSync(join(dir.path, "helpers.ts"), "");
		writeFileSync(join(dir.path, "get.index.test.ts"), "");

		const routes = walk(dir.path);
		assert.equal(routes.length, 1);
	});

	it("collects ancestor hooks, outermost first, sorted within a folder", (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		writeFileSync(join(dir.path, "_hook.b.ts"), "");
		writeFileSync(join(dir.path, "_hook.a.ts"), "");
		mkdirSync(join(dir.path, "users"));
		writeFileSync(join(dir.path, "users", "_hook.auth.ts"), "");
		writeFileSync(join(dir.path, "users", "get.index.ts"), "");

		const routes = walk(dir.path);
		assert.equal(routes.length, 1);
		const [route] = routes;
		assert.ok(route);
		assert.deepEqual(route.hooks, [
			join(dir.path, "_hook.a.ts"),
			join(dir.path, "_hook.b.ts"),
			join(dir.path, "users", "_hook.auth.ts"),
		]);
	});

	it("strips (group) folders from the route path but still applies their hooks", (t) => {
		const dir = createTempDir();
		t.after(dir.cleanup);
		mkdirSync(join(dir.path, "(public)"));
		writeFileSync(join(dir.path, "(public)", "_hook.log.ts"), "");
		writeFileSync(join(dir.path, "(public)", "post.login.ts"), "");

		const routes = walk(dir.path);
		const [route] = routes;
		assert.ok(route);
		assert.equal(route.routePath, "/login");
		assert.deepEqual(route.hooks, [join(dir.path, "(public)", "_hook.log.ts")]);
	});
});

describe("assertNoDuplicateRoutes", () => {
	it("does not throw when there are no duplicates", () => {
		assert.doesNotThrow(() =>
			assertNoDuplicateRoutes([
				{ method: "GET", routePath: "/a", filePath: "a.ts", hooks: [] },
				{ method: "POST", routePath: "/a", filePath: "b.ts", hooks: [] },
			]),
		);
	});

	it("throws identifying the method+path and both files for a duplicate", () => {
		assert.throws(
			() =>
				assertNoDuplicateRoutes([
					{ method: "GET", routePath: "/a", filePath: "first.ts", hooks: [] },
					{ method: "GET", routePath: "/a", filePath: "second.ts", hooks: [] },
				]),
			/GET \/a.*first\.ts.*second\.ts/,
		);
	});
});

describe("composeRoute", () => {
	const validRoute = () => defineRoute({ response: z.object({}), handler: async () => ({ data: {} }) });

	it("throws a clear error when the handler wasn't wrapped with defineRoute", () => {
		assert.throws(() => composeRoute("bad-route.ts", {}, []), /did you forget to wrap it with defineRoute\(\)/);
	});

	it("throws a clear error when a hook wasn't wrapped with defineHook", () => {
		assert.throws(
			() => composeRoute("route.ts", validRoute(), [["bad-hook.ts", {}]]),
			/did you forget to wrap it with defineHook\(\)/,
		);
	});

	it("calls the handler directly when there are no hooks", async () => {
		const handler = composeRoute("route.ts", validRoute(), []);
		const result = await handler(baseReq);
		assert.deepEqual(result.data, {});
	});

	it("runs hooks in order and short-circuits on the first one that returns a result", async () => {
		const order: string[] = [];
		const hookA = defineHook(async () => {
			order.push("a");
			return undefined;
		});
		const hookB = defineHook(async () => {
			order.push("b");
			return { statusCode: 401, data: "stop" };
		});
		const hookC = defineHook(async () => {
			order.push("c");
			return undefined;
		});

		const handler = composeRoute("route.ts", validRoute(), [
			["hook-a.ts", hookA],
			["hook-b.ts", hookB],
			["hook-c.ts", hookC],
		]);

		const result = await handler(baseReq);
		assert.deepEqual(order, ["a", "b"]);
		assert.deepEqual(result, { statusCode: 401, data: "stop" });
	});

	it("uses the supplied requestId instead of generating one", async () => {
		let seen: string | undefined;
		const probe = defineRoute({
			response: z.object({}),
			handler: async () => {
				seen = getContext().requestId;
				return { data: {} };
			},
		});

		const handler = composeRoute("route.ts", probe, []);
		await handler(baseReq, { requestId: "custom-id" });
		assert.equal(seen, "custom-id");
	});

	it("generates a requestId when none is supplied", async () => {
		let seen: string | undefined;
		const probe = defineRoute({
			response: z.object({}),
			handler: async () => {
				seen = getContext().requestId;
				return { data: {} };
			},
		});

		const handler = composeRoute("route.ts", probe, []);
		await handler(baseReq);
		assert.ok(seen && seen.length > 0);
	});
});
