import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defineHook, isHookHandler } from "../src/defineHook.ts";

describe("defineHook / isHookHandler", () => {
	it("marks the returned function as a hook handler", () => {
		const hook = defineHook(async () => undefined);
		assert.equal(isHookHandler(hook), true);
	});

	it("rejects a plain, unwrapped function", () => {
		const plain = async () => undefined;
		assert.equal(isHookHandler(plain), false);
	});

	it("rejects non-function values", () => {
		assert.equal(isHookHandler(undefined), false);
		assert.equal(isHookHandler(null), false);
		assert.equal(isHookHandler("hook"), false);
		assert.equal(isHookHandler({}), false);
	});

	it("preserves the handler's own behavior", async () => {
		const hook = defineHook(async (req) => {
			if (!req.headers.authorization) return { statusCode: 401, data: "no" };
			return undefined;
		});

		assert.deepEqual(await hook({ headers: {} }), { statusCode: 401, data: "no" });
		assert.equal(await hook({ headers: { authorization: "Bearer x" } }), undefined);
	});
});
