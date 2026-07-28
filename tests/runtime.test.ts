import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { defineRoute } from "../src/defineRoute.ts";
import { createLogger } from "../src/logger.ts";
import { start } from "../src/runtime.ts";
import { composeRoute, type Route } from "../src/scan.ts";

const createCapturingLogger = () => {
	const chunks: string[] = [];
	const logger = createLogger({
		write(chunk: string) {
			chunks.push(chunk);
			return true;
		},
	});
	return { logger, records: () => chunks.map((chunk) => JSON.parse(chunk) as Record<string, unknown>) };
};

describe("start", () => {
	it("serves a registered route and sets x-request-id", async (t) => {
		const routeHandler = defineRoute({ response: z.object({}), handler: async () => ({ data: {} }) });
		const route: Route = { method: "GET", url: "/hello", handler: composeRoute("route.ts", routeHandler, []) };

		const { port, stop } = await start({ port: 0, routes: [route], allowOrigins: [] });
		t.after(stop);

		const res = await fetch(`http://localhost:${port}/hello`);
		assert.equal(res.status, 200);
		assert.ok(res.headers.get("x-request-id"));
	});

	it("applies statusCode/headers/cookies from the route result", async (t) => {
		const routeHandler = defineRoute({
			response: z.object({}),
			handler: async () => ({
				statusCode: 201,
				data: {},
				headers: { "x-custom": "yes" },
				cookies: [{ name: "session", value: "abc" }],
			}),
		});
		const route: Route = { method: "GET", url: "/cookie", handler: composeRoute("route.ts", routeHandler, []) };

		const { port, stop } = await start({ port: 0, routes: [route], allowOrigins: [] });
		t.after(stop);

		const res = await fetch(`http://localhost:${port}/cookie`);
		assert.equal(res.status, 201);
		assert.equal(res.headers.get("x-custom"), "yes");
		assert.match(res.headers.get("set-cookie") ?? "", /session=abc/);
	});

	it("returns 404 for an unregistered route", async (t) => {
		const { port, stop } = await start({ port: 0, routes: [], allowOrigins: [] });
		t.after(stop);

		const res = await fetch(`http://localhost:${port}/nope`);
		assert.equal(res.status, 404);
	});

	it("returns 500 without crashing when a handler throws, and keeps serving", async (t) => {
		const boomHandler = defineRoute({
			response: z.object({}),
			handler: async () => {
				throw new Error("kaboom");
			},
		});
		const okHandler = defineRoute({ response: z.object({}), handler: async () => ({ data: {} }) });
		const routes: Route[] = [
			{ method: "GET", url: "/boom", handler: composeRoute("route.ts", boomHandler, []) },
			{ method: "GET", url: "/ok", handler: composeRoute("route.ts", okHandler, []) },
		];

		const { port, stop } = await start({ port: 0, routes, allowOrigins: [] });
		t.after(stop);

		const res = await fetch(`http://localhost:${port}/boom`);
		assert.equal(res.status, 500);
		assert.deepEqual(await res.json(), { error: "Internal Server Error" });

		const ok = await fetch(`http://localhost:${port}/ok`);
		assert.equal(ok.status, 200);
	});

	it("keeps the real message for a client-caused 4xx (malformed JSON body)", async (t) => {
		const routeHandler = defineRoute({ response: z.object({}), handler: async () => ({ data: {} }) });
		const route: Route = { method: "POST", url: "/echo", handler: composeRoute("route.ts", routeHandler, []) };

		const { port, stop } = await start({ port: 0, routes: [route], allowOrigins: [] });
		t.after(stop);

		const res = await fetch(`http://localhost:${port}/echo`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{not valid json",
		});

		assert.equal(res.status, 400);
		const body = (await res.json()) as { error: string };
		assert.match(body.error, /not valid json/i);
	});

	it("logs a returned (not thrown) 5xx result's cause at error level", async (t) => {
		const { logger, records } = createCapturingLogger();
		const routeHandler = defineRoute({
			response: z.object({}),
			handler: async () => ({ statusCode: 500, data: { error: "nope" }, cause: new Error("db unreachable") }),
		});
		const route: Route = { method: "GET", url: "/fail", handler: composeRoute("route.ts", routeHandler, []) };

		const { port, stop } = await start({ port: 0, routes: [route], allowOrigins: [], logger });
		t.after(stop);

		const res = await fetch(`http://localhost:${port}/fail`);
		assert.equal(res.status, 500);
		assert.deepEqual(await res.json(), { error: "nope" });

		const errorRecord = records().find((r) => r.level === 50);
		assert.ok(errorRecord, "expected an error-level log line");
		assert.equal((errorRecord.err as { message: string }).message, "db unreachable");
	});

	it("does not error-log a returned 4xx result, even with a cause attached", async (t) => {
		const { logger, records } = createCapturingLogger();
		const routeHandler = defineRoute({
			response: z.object({}),
			handler: async () => ({ statusCode: 401, data: { error: "nope" }, cause: new Error("expired token") }),
		});
		const route: Route = { method: "GET", url: "/denied", handler: composeRoute("route.ts", routeHandler, []) };

		const { port, stop } = await start({ port: 0, routes: [route], allowOrigins: [], logger });
		t.after(stop);

		const res = await fetch(`http://localhost:${port}/denied`);
		assert.equal(res.status, 401);
		assert.ok(!records().some((r) => r.level === 50));
	});

	it("rejects a request body larger than the configured bodyLimit", async (t) => {
		const routeHandler = defineRoute({ response: z.object({}), handler: async () => ({ data: {} }) });
		const route: Route = { method: "POST", url: "/echo", handler: composeRoute("route.ts", routeHandler, []) };

		const { port, stop } = await start({ port: 0, routes: [route], allowOrigins: [], bodyLimit: 10 });
		t.after(stop);

		const res = await fetch(`http://localhost:${port}/echo`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message: "this body is well over ten bytes" }),
		});

		assert.equal(res.status, 413);
	});
});
