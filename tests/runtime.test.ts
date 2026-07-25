import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { defineRoute } from "../src/defineRoute.ts";
import { start } from "../src/runtime.ts";
import { composeRoute, type Route } from "../src/scan.ts";

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
