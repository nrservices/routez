import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runInContext } from "../src/context.ts";
import { createLogger, formatLine } from "../src/logger.ts";

const createCapturingDestination = () => {
	const chunks: string[] = [];
	return {
		chunks,
		write(chunk: string): boolean {
			chunks.push(chunk);
			return true;
		},
	};
};

describe("formatLine", () => {
	it("colorizes and labels a JSON log line", () => {
		const line = JSON.stringify({ level: 30, time: Date.now(), msg: "hello" });
		const formatted = formatLine(line);
		assert.match(formatted, /INFO/);
		assert.match(formatted, /hello/);
	});

	it("includes the requestId when present", () => {
		const line = JSON.stringify({ level: 30, time: Date.now(), msg: "hi", requestId: "req-42" });
		assert.match(formatLine(line), /req-42/);
	});

	it("returns the original line unchanged if it isn't valid JSON", () => {
		assert.equal(formatLine("not json"), "not json");
	});

	it("renders err.stack with real line breaks instead of a literal \\n", () => {
		const line = JSON.stringify({
			level: 50,
			time: Date.now(),
			msg: "request failed",
			err: { type: "Error", message: "boom", stack: "Error: boom\n    at foo (file.js:1:1)" },
		});
		const formatted = formatLine(line);
		assert.match(formatted, /Error: boom\n\s+at foo \(file\.js:1:1\)/);
		assert.doesNotMatch(formatted, /\\n/);
	});

	it("still shows non-stack err fields (type, message, custom props) inline", () => {
		const line = JSON.stringify({
			level: 50,
			time: Date.now(),
			msg: "request failed",
			err: { type: "Error", message: "boom", stack: "Error: boom", statusCode: 500 },
		});
		const formatted = formatLine(line);
		assert.match(formatted, /"type":"Error"/);
		assert.match(formatted, /"message":"boom"/);
		assert.match(formatted, /"statusCode":500/);
		assert.doesNotMatch(formatted, /"stack"/);
	});

	it("leaves a non-object err (already a primitive) untouched", () => {
		const line = JSON.stringify({ level: 50, time: Date.now(), msg: "request failed", err: "just a string" });
		assert.match(formatLine(line), /"err":"just a string"/);
	});
});

describe("createLogger", () => {
	it("writes structured JSON to the given destination", () => {
		const destination = createCapturingDestination();
		const logger = createLogger(destination);

		logger.info("hello");

		const [line] = destination.chunks;
		assert.ok(line);
		const record = JSON.parse(line);
		assert.equal(record.msg, "hello");
		assert.equal(record.level, 30);
	});

	it("includes the active request's requestId via mixin", async () => {
		const destination = createCapturingDestination();
		const logger = createLogger(destination);

		await runInContext({ requestId: "req-99" }, async () => {
			logger.info("inside a request");
		});

		const [line] = destination.chunks;
		assert.ok(line);
		assert.equal(JSON.parse(line).requestId, "req-99");
	});

	it("omits requestId when logging outside of any request context", () => {
		const destination = createCapturingDestination();
		const logger = createLogger(destination);

		logger.info("outside a request");

		const [line] = destination.chunks;
		assert.ok(line);
		assert.equal(JSON.parse(line).requestId, undefined);
	});

	it("respects LOG_LEVEL", (t) => {
		const original = process.env.LOG_LEVEL;
		process.env.LOG_LEVEL = "error";
		t.after(() => {
			if (original === undefined) delete process.env.LOG_LEVEL;
			else process.env.LOG_LEVEL = original;
		});

		const destination = createCapturingDestination();
		const logger = createLogger(destination);

		logger.info("should be filtered out");
		logger.error("should come through");

		assert.equal(destination.chunks.length, 1);
		const [line] = destination.chunks;
		assert.ok(line);
		assert.match(line, /should come through/);
	});
});
