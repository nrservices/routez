# Changelog

All notable changes to this project are documented in this file.

## [0.1.2] - 2026-07-27

### Fixed

- A project's own package.json `imports` subpath aliases (e.g. `"#/*": "./src/domain/*"`) were left external instead of bundled, like a third-party npm package - silently depending on the raw, un-transpiled source tree being deployed alongside the built `entry.js`, and on Node's own `imports`-field/native-TypeScript-execution behavior working identically at runtime as it did wherever the project was built. Now bundled the same way relative and absolute imports already were: a built `entry.js` (plus `node_modules` for genuine dependencies) is self-contained and no longer needs the project's source tree to exist next to it at all.

### Added

- `restez dev`'s file watcher now also covers every directory referenced by the project's package.json `imports` field, not just `routesDir`. Editing a file reached only through an aliased import (e.g. `#/event/Event.ts`) now triggers a rebuild - previously it silently didn't, since such files were resolved fresh from disk by Node rather than bundled, and nothing pointed the watcher at them.

## [0.1.1] - 2026-07-25

### Fixed

- The Fastify error handler no longer leaks internal error messages to clients for unexpected (5xx) errors. Only a 4xx Fastify raises itself (malformed JSON, unsupported content-type, payload too large, ...) keeps its real message - it describes a problem with the client's own request. Everything else (an unhandled throw from application code) now returns a generic `"Internal Server Error"`, with the full error still logged server-side via the configured logger.

### Added

- Process-level `uncaughtException`/`unhandledRejection` handlers in the generated entry (shared by `restez dev` and `restez start`). An error escaping a request's own lifecycle (a fire-and-forget rejection, a throw inside a timer callback, ...) now logs clearly through the configured logger and exits, instead of Node's default of crashing silently with no structured log entry.
- `bodyLimit`/`requestTimeout` options on `RoutingConfig`, passed straight through to the underlying Fastify instance so a project can tune request size/duration limits without forking `runtime.ts`. Set via `restez.config.ts` only - no CLI flag (matching `allowOrigins`) and, unlike `port`/`allowOrigins`, no `.env` support either.

### Removed

- The hardcoded `/healthz` route. It always returned a static `{status: "ok"}` with no way for a project to plug in real checks (DB reachability, etc.). Define `routes/get.healthz.ts` like any other route if you need a health endpoint - the same `defineRoute`/Zod mechanism used everywhere else.

## [0.1.0] - 2026-07-23

Initial release.

### Added

- File-based routing (`routes/get.index.ts`, `routes/post.$id.ts`, `(group)` folders, `$param` segments), following TanStack Router-style conventions.
- Hooks (`_hook.*.ts`) applying to every route in their folder and below, able to short-circuit the chain before the route handler runs.
- `defineRoute` with Zod-validated `body`/`queryString`/`params`/`headers`/`cookies`/`response`.
- A bundled, zero-dependency default server (Fastify, with CORS/cookies/security headers) and logger (pino) - a project only needs to install `restez` and `zod`.
- `restez dev` / `restez build` / `restez start` CLI.
- Config resolution across CLI flag > `restez.config.ts` > `.env` > default, including forwarding raw `process.env` strings for `port`/`allowOrigins` without parsing them by hand.
- A native `node:test` suite.

### Fixed

- `tsconfig.build.json` leaking stray `.d.ts` files into `tests/`.

### Changed

- Package renamed to `@nrserv/restez`.
