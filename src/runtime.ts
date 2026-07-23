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
}: RuntimeOptions): Promise<StartedServer> {
	const log = customLogger ?? defaultLogger;

	// Request/response auto-logging is off: it would log Fastify's own req.id, a second
	// correlation id alongside this package's own (runtime-agnostic) requestId below.
	const server = fastify({
		trustProxy: true,
		loggerInstance: log,
		logController: new LogController({ disableRequestLogging: true }),
	});

	await server.register(cors, {
		origin,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		credentials: true,
	});

	await server.register(helmet);
	await server.register(cookie);

	server.setErrorHandler<FastifyError>((error, _request, reply) => {
		log.error(error);
		reply.status(error.statusCode ?? 500).send({ error: error.message });
	});

	server.setNotFoundHandler((_request, reply) => {
		reply.status(404).send({ error: "Not found" });
	});

	server.get("/healthz", async () => ({ status: "ok" }));

	routes.forEach(({ method, url, handler }) => {
		server.route({
			method,
			url,
			handler: async (req, reply) => {
				const requestId = req.id;
				const startedAt = Date.now();

				const result = await handler(req, { requestId });

				// `requestId` is explicit here, not via the logger's mixin - by this point
				// composeRoute's own context (established only around hooks+handler) has
				// already closed, so getContext() wouldn't find it.
				log.info(
					{ requestId, method, url, statusCode: result.statusCode ?? 200, durationMs: Date.now() - startedAt },
					"request completed",
				);

				void reply.header("x-request-id", String(requestId));

				if (result.headers) {
					void reply.headers(result.headers);
				}

				for (const responseCookie of result.cookies ?? []) {
					void reply.setCookie(responseCookie.name, responseCookie.value, responseCookie);
				}

				void reply.status(result.statusCode ?? 200).send(result.data);
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
