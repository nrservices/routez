import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRoutePath } from "../src/path.ts";

describe("buildRoutePath", () => {
	it("returns root when there are no segments at all", () => {
		assert.equal(buildRoutePath([]), "/");
	});

	it("joins plain folder segments", () => {
		assert.equal(buildRoutePath(["users", "posts"]), "/users/posts");
	});

	it("turns a $name folder segment into :name", () => {
		assert.equal(buildRoutePath(["users", "$id"]), "/users/:id");
	});

	it("strips a (group) folder segment from the path", () => {
		assert.equal(buildRoutePath(["(public)", "auth"]), "/auth");
	});

	it("appends file name segments after folder segments", () => {
		assert.equal(buildRoutePath(["users"], ["profile"]), "/users/profile");
	});

	it("turns a $name file name segment into :name", () => {
		assert.equal(buildRoutePath(["users"], ["$id"]), "/users/:id");
	});

	it('drops an "index" file name segment', () => {
		assert.equal(buildRoutePath(["users"], ["index"]), "/users");
	});

	it("strips a (group) file name segment too", () => {
		assert.equal(buildRoutePath(["users"], ["(group)"]), "/users");
	});

	it("returns root when every segment is stripped away", () => {
		assert.equal(buildRoutePath(["(public)"], ["index"]), "/");
	});

	it("combines folders and file segments, including $params in both", () => {
		assert.equal(buildRoutePath(["(protected)", "sites", "$siteId"], ["$eventId"]), "/sites/:siteId/:eventId");
	});
});
