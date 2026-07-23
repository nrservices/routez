import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { defineRoute } from "../src/defineRoute.ts";
import { start } from "../src/runtime.ts";
import { composeRoute, type Route } from "../src/scan.ts";

describe("start", () => {
	it("responds on /healthz", async (t) => {
		const { port, stop } = await start({ port: 0, routes: [], allowOrigins: [] });
		t.after(stop);

		const res = await fetch(`http://localhost:${port}/healthz`);
		assert.equal(res.status, 200);
		assert.deepEqual(await res.json(), { status: "ok" });
	});

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
		const routeHandler = defineRoute({
			response: z.object({}),
			handler: async () => {
				throw new Error("kaboom");
			},
		});
		const route: Route = { method: "GET", url: "/boom", handler: composeRoute("route.ts", routeHandler, []) };

		const { port, stop } = await start({ port: 0, routes: [route], allowOrigins: [] });
		t.after(stop);

		const res = await fetch(`http://localhost:${port}/boom`);
		assert.equal(res.status, 500);

		const health = await fetch(`http://localhost:${port}/healthz`);
		assert.equal(health.status, 200);
	});
});
