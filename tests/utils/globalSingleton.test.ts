import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getGlobalSingleton } from "../../src/utils/globalSingleton.ts";

describe("getGlobalSingleton", () => {
	it("creates the value once and reuses it for the same key", () => {
		const key = Symbol.for("restez-test:singleton-a");
		let creations = 0;
		const create = () => {
			creations += 1;
			return { id: creations };
		};

		const first = getGlobalSingleton(key, create);
		const second = getGlobalSingleton(key, create);

		assert.equal(creations, 1);
		assert.equal(first, second);
	});

	it("keeps different keys independent", () => {
		const keyA = Symbol.for("restez-test:singleton-b");
		const keyB = Symbol.for("restez-test:singleton-c");

		const a = getGlobalSingleton(keyA, () => ({ label: "a" }));
		const b = getGlobalSingleton(keyB, () => ({ label: "b" }));

		assert.notEqual(a, b);
	});
});
