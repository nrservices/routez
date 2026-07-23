import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRunner } from "../../src/utils/createRunner.ts";

const deferred = <T = void>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
};

describe("createRunner", () => {
	it("runs the task once for a single schedule() call", async () => {
		let calls = 0;
		const runner = createRunner(async () => {
			calls += 1;
		});

		await runner.schedule();
		assert.equal(calls, 1);
	});

	it("re-runs once more if schedule() is called again while a run is in flight, without overlapping", async () => {
		const order: string[] = [];
		let callCount = 0;
		const gate = deferred();

		const runner = createRunner(async () => {
			callCount += 1;
			order.push(`start-${callCount}`);
			if (callCount === 1) await gate.promise;
			order.push(`end-${callCount}`);
		});

		const first = runner.schedule();
		const second = runner.schedule();

		assert.equal(first, second, "schedule() returns the same in-flight promise while running");

		gate.resolve();
		await first;

		assert.equal(callCount, 2, "task ran a second time because schedule() was called while busy");
		assert.deepEqual(order, ["start-1", "end-1", "start-2", "end-2"]);
	});

	it("does not trigger extra runs once idle", async () => {
		let callCount = 0;
		const gate = deferred();

		const runner = createRunner(async () => {
			callCount += 1;
			if (callCount === 1) await gate.promise;
		});

		const scheduled = runner.schedule();
		runner.schedule();

		gate.resolve();
		await scheduled;

		assert.equal(callCount, 2);
		await runner.idle();
		assert.equal(callCount, 2, "idle() didn't trigger any extra run");
	});

	it("idle() resolves immediately when nothing is running", async () => {
		const runner = createRunner(async () => {});
		await runner.idle();
	});
});
