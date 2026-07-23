import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tryCatch } from "../../src/utils/tryCatch.ts";

describe("tryCatch", () => {
	it("returns [value, undefined] when the function resolves", async () => {
		const [value, error] = await tryCatch(async () => 42);
		assert.equal(value, 42);
		assert.equal(error, undefined);
	});

	it("returns [undefined, error] when the function rejects with an Error", async () => {
		const original = new Error("boom");
		const [value, error] = await tryCatch(async () => {
			throw original;
		});
		assert.equal(value, undefined);
		assert.equal(error, original);
	});

	it("wraps a non-Error rejection into an Error", async () => {
		const [value, error] = await tryCatch(async () => {
			throw "plain string failure";
		});
		assert.equal(value, undefined);
		assert.ok(error instanceof Error);
		assert.equal(error?.message, "plain string failure");
	});
});
