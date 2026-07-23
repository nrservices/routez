import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getContext, getContextData, runInContext, setContextData } from "../src/context.ts";

declare module "../src/context.ts" {
	interface RequestContextData {
		value: string;
		key: string;
		missing: string;
	}
}

describe("context", () => {
	it("getContext() throws outside of runInContext", () => {
		assert.throws(() => getContext(), /must be called within a request execution context/);
	});

	it("exposes the given requestId inside the callback", async () => {
		await runInContext({ requestId: "req-1" }, async () => {
			assert.equal(getContext().requestId, "req-1");
		});
	});

	it("keeps the context available across an await inside the callback", async () => {
		await runInContext({ requestId: "req-2" }, async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			assert.equal(getContext().requestId, "req-2");
		});
	});

	it("does not leak context data between two separate runInContext calls", async () => {
		await runInContext({ requestId: "req-a" }, async () => {
			setContextData("value", "a");
		});

		await runInContext({ requestId: "req-b" }, async () => {
			assert.equal(getContextData("value"), undefined);
		});
	});

	it("round-trips setContextData/getContextData within the same context", async () => {
		await runInContext({ requestId: "req-3" }, async () => {
			setContextData("key", "value");
			assert.equal(getContextData("key"), "value");
		});
	});

	it("returns undefined for a key that was never set", async () => {
		await runInContext({ requestId: "req-4" }, async () => {
			assert.equal(getContextData("missing"), undefined);
		});
	});

	it("setContextData throws outside of a context", () => {
		assert.throws(() => setContextData("key", "value"));
	});
});
