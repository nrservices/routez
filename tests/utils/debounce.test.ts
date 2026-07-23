import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { debounce } from "../../src/utils/debounce.ts";

describe("debounce", () => {
	it("collapses rapid calls into one, using the last arguments", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const calls: number[] = [];
		const debounced = debounce((n: number) => calls.push(n), 50);

		debounced(1);
		debounced(2);
		debounced(3);

		t.mock.timers.tick(50);

		assert.deepEqual(calls, [3]);
	});

	it("fires once per call when calls are spaced beyond the delay", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const calls: number[] = [];
		const debounced = debounce((n: number) => calls.push(n), 50);

		debounced(1);
		t.mock.timers.tick(50);
		debounced(2);
		t.mock.timers.tick(50);

		assert.deepEqual(calls, [1, 2]);
	});

	it("does not fire before the delay has elapsed", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const calls: number[] = [];
		const debounced = debounce((n: number) => calls.push(n), 50);

		debounced(1);
		t.mock.timers.tick(49);

		assert.deepEqual(calls, []);
	});
});
