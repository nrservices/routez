import { defineConfig, type OutputOptions } from "rolldown";

// The default runtime (fastify + its plugins) is fully bundled in, not external: a project
// that only installs restez shouldn't have to install anything else. This is safe because
// the default runtime and a future custom-entry-file (bring your own server/adapter) are
// mutually exclusive - a project using its own Fastify instance would go through a custom
// entry instead of this default one, so there's never two competing instances in one process.
const external = ["rolldown"];

const output: OutputOptions[] = [
	{ dir: "dist/esm", format: "esm", entryFileNames: "[name].js" },
	{ dir: "dist/cjs", format: "cjs", entryFileNames: "[name].cjs" },
];

export default defineConfig([
	{ input: { cli: "src/cli.ts" }, platform: "node", external, output },
	{ input: { runtime: "src/runtime.ts" }, platform: "node", external, output },
	{ input: { index: "src/index.ts" }, platform: "node", external, output },
]);
