import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOOK_FILE_PATTERN, ROUTE_FILE_PATTERN } from "../src/constants.ts";

describe("ROUTE_FILE_PATTERN", () => {
	it("matches a verb + segments file name", () => {
		assert.match("get.index.ts", ROUTE_FILE_PATTERN);
		assert.match("post.$id.ts", ROUTE_FILE_PATTERN);
		assert.match("delete.$eventId.ts", ROUTE_FILE_PATTERN);
	});

	it("captures the verb and the remaining segments", () => {
		const match = ROUTE_FILE_PATTERN.exec("patch.$id.tags.ts");
		assert.ok(match);
		assert.equal(match[1], "patch");
		assert.equal(match[2], "$id.tags");
	});

	it("rejects files without a recognized HTTP verb prefix", () => {
		assert.equal(ROUTE_FILE_PATTERN.test("index.ts"), false);
		assert.equal(ROUTE_FILE_PATTERN.test("_hook.auth.ts"), false);
		assert.equal(ROUTE_FILE_PATTERN.test("get.ts"), false);
	});

	it("excludes co-located test files via the negative lookahead", () => {
		assert.equal(ROUTE_FILE_PATTERN.test("get.index.test.ts"), false);
	});
});

describe("HOOK_FILE_PATTERN", () => {
	it("matches _hook.<name>.ts", () => {
		assert.match("_hook.auth.ts", HOOK_FILE_PATTERN);
	});

	it("captures the hook name", () => {
		const match = HOOK_FILE_PATTERN.exec("_hook.siteGuard.ts");
		assert.ok(match);
		assert.equal(match[1], "siteGuard");
	});

	it("rejects files without the leading underscore", () => {
		assert.equal(HOOK_FILE_PATTERN.test("hook.auth.ts"), false);
	});
});
