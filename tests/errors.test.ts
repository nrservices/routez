import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { badRequest, conflict, forbidden, httpError, notFound, serverError, unauthorized } from "../src/errors.ts";

describe("error helpers", () => {
	it("badRequest returns 400", () => {
		assert.equal(badRequest().statusCode, 400);
	});

	it("unauthorized returns 401", () => {
		assert.equal(unauthorized().statusCode, 401);
	});

	it("forbidden returns 403", () => {
		assert.equal(forbidden().statusCode, 403);
	});

	it("notFound returns 404", () => {
		assert.equal(notFound().statusCode, 404);
	});

	it("conflict returns 409", () => {
		assert.equal(conflict().statusCode, 409);
	});

	it("serverError returns 500", () => {
		assert.equal(serverError().statusCode, 500);
	});

	it("httpError accepts any status code", () => {
		assert.deepEqual(httpError(429, "slow down"), { statusCode: 429, data: "slow down", cause: undefined });
	});

	it("carries data and cause through without mixing them up", () => {
		const cause = new Error("boom");
		const result = serverError("Internal Server Error", cause);
		assert.equal(result.data, "Internal Server Error");
		assert.equal(result.cause, cause);
	});

	it("defaults data/cause to undefined when omitted", () => {
		const result = notFound();
		assert.equal(result.data, undefined);
		assert.equal(result.cause, undefined);
	});
});
