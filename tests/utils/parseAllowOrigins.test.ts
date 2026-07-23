import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAllowOrigins } from "../../src/utils/parseAllowOrigins.ts";

describe("parseAllowOrigins", () => {
	it("returns an empty array for undefined", () => {
		assert.deepEqual(parseAllowOrigins(undefined), []);
	});

	it("returns an empty array for an empty string", () => {
		assert.deepEqual(parseAllowOrigins(""), []);
	});

	it("splits a comma-separated list", () => {
		assert.deepEqual(parseAllowOrigins("https://a.com,https://b.com"), ["https://a.com", "https://b.com"]);
	});

	it("trims whitespace around each origin", () => {
		assert.deepEqual(parseAllowOrigins(" https://a.com , https://b.com "), ["https://a.com", "https://b.com"]);
	});

	it("filters out empty entries from stray commas", () => {
		assert.deepEqual(parseAllowOrigins("https://a.com,,https://b.com,"), ["https://a.com", "https://b.com"]);
	});
});
