import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { type FastifyError, fastify, LogController } from "fastify";
import type { Logger } from "./logger.ts";
import { logger as defaultLogger } from "./logger.ts";
import type { Route } from "./scan.ts";

export { loadConfig } from "./config.ts";
export { logger } from "./logger.ts";
export { composeRoute } from "./scan.ts";

export interface RuntimeOptions {
	routes: Route[];
	port: number;
	allowOrigins?: string[];
	logger?: Logger;
	bodyLimit?: number;
	requestTimeout?: number;
}

export interface StartedServer {
	/** The actual bound port - the same value as `RuntimeOptions.port`, except when it was `0` (OS-assigned). */
	port: number;
	stop: () => Promise<void>;
}

/**
 * Resolves once listening, or rejects on failure - never calls `process.exit` itself, so it
 * stays composable (testable in-process) and lets the caller (the generated entry, `restez start`,
 * or a test) decide what "shut down" means, same split as `dev.ts`'s own returned `stop`.
 */
export async function start({
	port,
	routes,
	allowOrigins: origin = [],
	logger: customLogger,
	bodyLimit,
	requestTimeout,
}: RuntimeOptions): Promise<StartedServer> {
	const log = customLogger ?? defaultLogger;

	// Request/response auto-logging is off: it would log Fastify's own req.id, a second
	// correlation id alongside this package's own (runtime-agnostic) requestId below.
	const server = fastify({
		trustProxy: true,
		loggerInstance: log,
		logController: new LogController({ disableRequestLogging: true }),
		bodyLimit,
		requestTimeout,
	});

	await server.register(cors, {
		origin,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		credentials: true,
	});

	await server.register(helmet);
	await server.register(cookie);

	// `error.message` is only trustworthy for a 4xx Fastify raises itself (bad JSON, unsupported
	// content-type, payload too large, ...) - it describes a problem with the client's own request.
	// Anything else reaching this handler is an unexpected throw from application code (a bug, a
	// rejected DB call, ...) whose message was never meant to be client-facing and may carry internal
	// detail; the full error is still available to the log line above.
	server.setErrorHandler<FastifyError>((error, _request, reply) => {
		log.error(error);
		const statusCode = error.statusCode ?? 500;
		const isClientError = statusCode >= 400 && statusCode < 500;
		reply.status(statusCode).send({ error: isClientError ? error.message : "Internal Server Error" });
	});

	server.setNotFoundHandler((_request, reply) => {
		reply.status(404).send({ error: "Not found" });
	});

	routes.forEach(({ method, url, handler }) => {
		server.route({
			method,
			url,
			handler: async (req, reply) => {
				const requestId = req.id;
				const startedAt = Date.now();

				const result = await handler(req, { requestId });
				const statusCode = result.statusCode ?? 200;

				// A route/hook can signal an error by returning `serverError()`/`httpError()`
				// instead of throwing - that skips `setErrorHandler` entirely, so this is the
				// only place a 5xx built that way ever gets logged. `err` (not `cause`) is the
				// key on purpose: pino only runs its Error-aware serializer (type/message/stack)
				// on a property named exactly `err`, same as the raw `Error` setErrorHandler logs.
				if (statusCode >= 500) {
					log.error({ requestId, method, url, statusCode, err: result.cause }, "request failed");
				}

				// `requestId` is explicit here, not via the logger's mixin - by this point
				// composeRoute's own context (established only around hooks+handler) has
				// already closed, so getContext() wouldn't find it.
				log.info({ requestId, method, url, statusCode, durationMs: Date.now() - startedAt }, "request completed");

				void reply.header("x-request-id", String(requestId));

				if (result.headers) {
					void reply.headers(result.headers);
				}

				for (const responseCookie of result.cookies ?? []) {
					void reply.setCookie(responseCookie.name, responseCookie.value, responseCookie);
				}

				void reply.status(statusCode).send(result.data);
			},
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.listen({ port }, (err) => {
			if (err) {
				reject(err);
				return;
			}

			log.info(`Server started on http://localhost:${port}`);
			resolve();
		});
	});

	const address = server.server.address();
	const actualPort = typeof address === "object" && address ? address.port : port;

	return {
		port: actualPort,
		stop: () => server.close(),
	};
}
