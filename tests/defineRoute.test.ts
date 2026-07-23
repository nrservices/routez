import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { defineRoute, isRouteHandler } from "../src/defineRoute.ts";
import type { RequestLike } from "../src/request.ts";

const baseReq = (overrides: Partial<RequestLike> = {}): RequestLike => ({
	headers: {},
	...overrides,
});

describe("defineRoute", () => {
	it("isRouteHandler recognizes a defineRoute() output and rejects everything else", () => {
		const handler = defineRoute({ response: z.object({}), handler: async () => ({ data: {} }) });
		assert.equal(isRouteHandler(handler), true);
		assert.equal(
			isRouteHandler(async () => {}),
			false,
		);
		assert.equal(isRouteHandler({}), false);
		assert.equal(isRouteHandler(undefined), false);
	});

	it("defaults statusCode to 200 on success", async () => {
		const handler = defineRoute({
			response: z.object({ ok: z.boolean() }),
			handler: async () => ({ data: { ok: true } }),
		});

		const result = await handler(baseReq());
		assert.equal(result.statusCode, 200);
		assert.deepEqual(result.data, { ok: true });
	});

	it("parses and types body/queryString/params/headers/cookies, only for what's declared", async () => {
		let received: unknown;
		const handler = defineRoute({
			body: z.object({ name: z.string() }),
			queryString: z.object({ page: z.coerce.number() }),
			params: z.object({ id: z.string() }),
			response: z.object({ ok: z.boolean() }),
			handler: async (req) => {
				received = req;
				return { data: { ok: true } };
			},
		});

		await handler(baseReq({ url: "/x?page=2", body: { name: "Ada" }, params: { id: "abc" } }));

		assert.deepEqual(received, {
			body: { name: "Ada" },
			queryString: { page: 2 },
			params: { id: "abc" },
			headers: undefined,
			cookies: undefined,
		});
	});

	it("returns 400 with issues when a declared schema fails, without calling the handler", async () => {
		let called = false;
		const handler = defineRoute({
			body: z.object({ name: z.string() }),
			response: z.object({ ok: z.boolean() }),
			handler: async () => {
				called = true;
				return { data: { ok: true } };
			},
		});

		const result = await handler(baseReq({ body: { name: 42 } }));

		assert.equal(called, false);
		assert.equal(result.statusCode, 400);
		assert.equal((result.data as { error: string }).error, "validation failed");
		assert.ok((result.data as { issues: Record<string, unknown> }).issues.body);
		assert.ok(result.cause);
	});

	it("reports issues for every failing field at once", async () => {
		const handler = defineRoute({
			body: z.object({ name: z.string() }),
			params: z.object({ id: z.uuid() }),
			response: z.object({ ok: z.boolean() }),
			handler: async () => ({ data: { ok: true } }),
		});

		const result = await handler(baseReq({ body: { name: 1 }, params: { id: "not-a-uuid" } }));

		const issues = (result.data as { issues: Record<string, unknown> }).issues;
		assert.ok(issues.body);
		assert.ok(issues.params);
	});

	it("parses the query string out of req.url", async () => {
		let received: unknown;
		const handler = defineRoute({
			queryString: z.object({ page: z.coerce.number(), q: z.string() }),
			response: z.object({}),
			handler: async (req) => {
				received = req.queryString;
				return { data: {} };
			},
		});

		await handler(baseReq({ url: "/search?page=3&q=hello" }));
		assert.deepEqual(received, { page: 3, q: "hello" });
	});

	it("validates response data only for success status codes, applying zod transforms", async () => {
		const handler = defineRoute({
			response: z.object({ id: z.string().transform((s) => s.toUpperCase()) }),
			handler: async () => ({ data: { id: "abc" } }),
		});

		const result = await handler(baseReq());
		assert.deepEqual(result.data, { id: "ABC" });
	});

	it("returns 500 when response data fails validation on a success status", async () => {
		const handler = defineRoute({
			response: z.object({ id: z.string() }),
			handler: async () => ({ data: { id: 42 } }) as never,
		});

		const result = await handler(baseReq());
		assert.equal(result.statusCode, 500);
		assert.equal((result.data as { error: string }).error, "response validation failed");
		assert.ok(result.cause);
	});

	it("does not validate data against response on a non-success status code", async () => {
		const handler = defineRoute({
			response: z.object({ id: z.string() }),
			handler: async () => ({ statusCode: 404, data: "not found, whatever shape" }),
		});

		const result = await handler(baseReq());
		assert.equal(result.statusCode, 404);
		assert.equal(result.data, "not found, whatever shape");
	});

	it("passes headers/cookies/cause through unchanged on both success and error paths", async () => {
		const headers = { "x-test": "1" };
		const cookies = [{ name: "a", value: "b" }];

		const errorHandler = defineRoute({
			response: z.object({}),
			handler: async () => ({ statusCode: 401, data: "no", headers, cookies, cause: "why" }),
		});
		const errorResult = await errorHandler(baseReq());
		assert.deepEqual(errorResult.headers, headers);
		assert.deepEqual(errorResult.cookies, cookies);
		assert.equal(errorResult.cause, "why");

		const successHandler = defineRoute({
			response: z.object({}),
			handler: async () => ({ data: {}, headers, cookies }),
		});
		const successResult = await successHandler(baseReq());
		assert.deepEqual(successResult.headers, headers);
		assert.deepEqual(successResult.cookies, cookies);
	});
});
