# restez

File-based routing for Node, with a zero-dependency server built in. Install
the package, drop route files in a `routes/` folder, run `restez dev`.

- **File-based routing** - `routes/get.index.ts`, `routes/post.$id.ts`, folders become URL segments.
- **Hooks** - `_hook.*.ts` files apply to every route in their folder and below (auth, logging, guards).
- **Zero extra dependencies** - the default server (Fastify + CORS/cookies/security headers) and logger (pino) are bundled into the package itself. Your project doesn't need to install any of it.
- **Typed, validated routes** - each route declares its `body`/`queryString`/`params`/`headers`/`cookies`/`response` as Zod schemas.

## Install

```bash
npm install restez zod
```

(`zod` isn't bundled - you need it yourself to write schemas anyway.)

## Quick start

```
your-project/
  routes/
    get.index.ts        →  GET  /
    post.login.ts       →  POST /login
    users/
      get.$id.ts         →  GET  /users/:id
      _hook.auth.ts       →  applies to every route under users/
```

```ts
// routes/get.index.ts
import { defineRoute } from "restez";
import { z } from "zod";

export default defineRoute({
  response: z.object({ status: z.string() }),
  handler: async () => ({ data: { status: "ok" } }),
});
```

```bash
npx restez dev
```

## Routing convention

A route file is named `<verb>.<segments>.ts`, where `<verb>` is one of
`get`, `post`, `put`, `patch`, `delete`, `head`, `options`.

- Folder names become path segments: `routes/users/get.index.ts` → `GET /users`.
- `$name` in a folder or file name becomes a `:name` path parameter: `routes/users/get.$id.ts` → `GET /users/:id`.
- `(group)` folders (parenthesized) are stripped from the URL - use them to organize routes without affecting the path, e.g. `routes/(public)/post.login.ts` → `POST /login`.
- `index` in a file name is dropped - `routes/users/get.index.ts` and `routes/users/get.ts` both mean `GET /users`.

## Defining a route

```ts
import { defineRoute } from "restez";
import { z } from "zod";

export default defineRoute({
  params: z.object({ id: z.uuid() }),
  queryString: z.object({ page: z.coerce.number().optional() }),
  body: z.object({ name: z.string() }),
  response: z.object({ id: z.uuid(), name: z.string() }),
  handler: async ({ params, queryString, body }) => {
    return { data: { id: params.id, name: body.name } };
  },
});
```

- `handler` returns `{ data, statusCode?, headers?, cookies? }`. `statusCode` defaults to `200`.
- `data` is validated against `response` only when `statusCode` is a success code (`200`/`201`/`202`/`204`). Any other status code (errors, redirects) carries whatever `data` makes sense, unvalidated - see [Error helpers](#error-helpers).
- Declaring `body`/`queryString`/`params`/`headers`/`cookies` is optional; only what you declare gets parsed, validated, and typed on the handler's argument.

## Error helpers

```ts
import { defineRoute, notFound, unauthorized, badRequest, forbidden, conflict, serverError, httpError } from "restez";

export default defineRoute({
  response: z.object({ id: z.uuid() }),
  handler: async ({ params }) => {
    const item = await findItem(params.id);
    if (!item) return notFound("Item not found");
    return { data: item };
  },
});
```

Each helper (`badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `serverError`) takes `(data?, cause?)`. `httpError(statusCode, data?, cause?)` covers any other status code. `cause` is never sent to the client - it's carried alongside the result for a logger to pick up.

To give every error response a consistent shape (checked at compile time, not validated at runtime), augment `ErrorResponseBody`:

```ts
declare module "restez" {
  interface ErrorResponseBody {
    error: string;
    code?: string;
  }
}
```

## Hooks

A hook file (`_hook.<name>.ts`) applies to every route in its folder and every folder below it. Hooks run in order (outermost folder first) before the route's own handler.

```ts
// routes/(protected)/_hook.auth.ts
import { defineHook, unauthorized, setContextData } from "restez";

export default defineHook(async (req) => {
  const token = req.headers.authorization;
  const user = token && (await verify(token));

  if (!user) return unauthorized("Unauthorized");

  setContextData("user", user);
  // returning nothing lets the chain continue to the next hook / the route handler
});
```

Returning a result from a hook (as `unauthorized(...)` does) stops the chain right there - the route handler and any remaining hooks never run.

## Sharing data between hooks and handlers

Route handlers only ever receive their own typed request (`body`, `params`, ...) - never the raw request, and never something a hook attached to it. To pass a value computed in a hook (e.g. the authenticated user) down to the handler, use the request context instead of mutating the request:

```ts
// in a hook
setContextData("user", user);

// in a route handler, or in any function called from it
import { getContextData } from "restez";
const user = getContextData("user");
```

Type the key once per project, via `declare module`:

```ts
declare module "restez" {
  interface RequestContextData {
    user: { id: string; email: string };
  }
}
```

## Logger

A [pino](https://getpino.io) logger is available out of the box - no extra install, no config required:

```ts
import { logger } from "restez";

logger.info("something happened");
logger.error({ err }, "something went wrong");
```

- Pretty, colored output in dev; plain JSON when `NODE_ENV=production`.
- `LOG_LEVEL` (env var) controls the level - defaults to `info`.
- Every log call made while handling a request automatically includes that request's `requestId` - no need to pass it around yourself.
- Every request that reaches a route logs one `"request completed"` line (`method`, `url`, `statusCode`, `durationMs`, `requestId`), and gets an `x-request-id` response header carrying the same id.

To use your own pino instance instead (custom transport, shipping logs elsewhere, ...), override it via config - see [Configuration](#configuration):

```ts
// restez.config.ts
import { defineConfig } from "restez";
import pino from "pino";

export default defineConfig({
  logger: pino({ transport: { target: "pino-datadog-transport" } }),
});
```

## CLI

```bash
restez dev      # start the dev server, rebuilding on every file change
restez build    # bundle the app once, without starting it
restez start    # run a build produced by `restez build`
```

Options (all three commands): `--routesDir <dir>` (default `./routes`), `--outDir <dir>` (default `.nrr`), `--port <port>` (default `3000`).

## Configuration

Options are resolved in this order: CLI flag > `restez.config.ts` > `.env` > default.

```ts
// restez.config.ts
import { defineConfig } from "restez";

export default defineConfig({
  port: 4000,
  allowOrigins: ["https://example.com"],
});
```

Without a `restez.config.ts`, a `.env` file at the project root is read automatically (`PORT`, `ALLOW_ORIGIN` as a comma-separated list).

## License

MIT
