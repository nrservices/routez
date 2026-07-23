import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PACKAGE_NAME } from "../../src/constants.ts";

export interface TempDir {
	path: string;
	cleanup: () => void;
}

export const createTempDir = (): TempDir => {
	const path = mkdtempSync(join(tmpdir(), `${PACKAGE_NAME}-test-`));
	return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
};
