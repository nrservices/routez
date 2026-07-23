import type { OutgoingHttpHeaders } from "node:http";
import type { z } from "zod";
import { ROUTE_HANDLER_MARKER } from "./constants.ts";
import type { RequestLike } from "./request.ts";

/** Any valid HTTP status code (200, 404, 500, ...). */
export type HttpCode =
	| 200
	| 201
	| 202
	| 204
	| 301
	| 302
	| 304
	| 400
	| 401
	| 403
	| 404
	| 405
	| 409
	| 422
	| 429
	| 500
	| 501
	| 502
	| 503;

export interface ResponseCookie {
	name: string;
	value: string;
	domain?: string;
	path?: string;
	expires?: Date;
	maxAge?: number;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "strict" | "lax" | "none";
}

export interface RouteResult<TData = unknown> {
	statusCode?: HttpCode;
	headers?: OutgoingHttpHeaders;
	cookies?: ResponseCookie[];
	data?: TData;
	/** Never sent to the client - carried alongside the result for a logger to pick up. */
	cause?: unknown;
}

/** Status codes whose `data` is validated against a route's `response` schema. */
export type SuccessHttpCode = 200 | 201 | 202 | 204;

/** Status codes returned by `error()` and friends - every `HttpCode` that isn't a success code. */
export type ErrorHttpCode = Exclude<HttpCode, SuccessHttpCode>;

const SUCCESS_HTTP_CODES: ReadonlySet<SuccessHttpCode> = new Set([200, 201, 202, 204]);

const isSuccessHttpCode = (code: HttpCode): code is SuccessHttpCode => SUCCESS_HTTP_CODES.has(code as SuccessHttpCode);

/**
 * Empty by default - augment via `declare module` in a consuming project to give every
 * error response (from `error()`/`notFound()`/... or a handler's own `{ statusCode, data }`
 * return) a project-wide shape, checked at compile time only (no runtime validation).
 */
// biome-ignore lint/suspicious/noEmptyInterface: intentionally augmentable via `declare module`
export interface ErrorResponseBody {}

/** `ErrorResponseBody` when augmented, otherwise `unknown` - keeps error `data` unconstrained by default. */
export type DefaultErrorData = keyof ErrorResponseBody extends never ? unknown : ErrorResponseBody;

interface HandlerResultBase {
	headers?: OutgoingHttpHeaders;
	cookies?: ResponseCookie[];
	/** Never sent to the client - carried alongside the result for a logger to pick up. */
	cause?: unknown;
}

/**
 * A handler's `data` is only checked against `response` when `statusCode` is a success code
 * (defaulting to 200) - any other status code (4xx, 5xx, redirects, ...) carries `DefaultErrorData`
 * instead (unconstrained unless a project augments `ErrorResponseBody`).
 */
export type HandlerResult<TResponse extends z.ZodType> =
	| (HandlerResultBase & { statusCode?: SuccessHttpCode; data: z.infer<TResponse> })
	| (HandlerResultBase & { statusCode: ErrorHttpCode; data?: DefaultErrorData });

type Infer<TSchema extends z.ZodType | undefined> = TSchema extends z.ZodType ? z.infer<TSchema> : undefined;

export interface TypedRequest<
	TQuery extends z.ZodType | undefined,
	TBody extends z.ZodType | undefined,
	THeaders extends z.ZodType | undefined,
	TParams extends z.ZodType | undefined,
	TCookies extends z.ZodType | undefined,
> {
	queryString: Infer<TQuery>;
	body: Infer<TBody>;
	headers: Infer<THeaders>;
	params: Infer<TParams>;
	cookies: Infer<TCookies>;
}

export interface RouteConfig<
	TQuery extends z.ZodType | undefined = undefined,
	TBody extends z.ZodType | undefined = undefined,
	THeaders extends z.ZodType | undefined = undefined,
	TParams extends z.ZodType | undefined = undefined,
	TCookies extends z.ZodType | undefined = undefined,
	TResponse extends z.ZodType = z.ZodType,
> {
	queryString?: TQuery;
	body?: TBody;
	headers?: THeaders;
	params?: TParams;
	cookies?: TCookies;
	response: TResponse;
	handler: (req: TypedRequest<TQuery, TBody, THeaders, TParams, TCookies>) => Promise<HandlerResult<TResponse>>;
}

export type RouteHandler = (req: RequestLike) => Promise<RouteResult>;

export function isRouteHandler(value: unknown): value is RouteHandler {
	return typeof value === "function" && (value as unknown as Record<symbol, unknown>)[ROUTE_HANDLER_MARKER] === true;
}

export function defineRoute<
	TQuery extends z.ZodType | undefined = undefined,
	TBody extends z.ZodType | undefined = undefined,
	THeaders extends z.ZodType | undefined = undefined,
	TParams extends z.ZodType | undefined = undefined,
	TCookies extends z.ZodType | undefined = undefined,
	TResponse extends z.ZodType = z.ZodType,
>(config: RouteConfig<TQuery, TBody, THeaders, TParams, TCookies, TResponse>): RouteHandler {
	const {
		queryString: queryStringSchema,
		body: bodySchema,
		headers: headersSchema,
		params: paramsSchema,
		cookies: cookiesSchema,
		response: responseSchema,
		handler,
	} = config;

	const routeHandler = async (req: RequestLike): Promise<RouteResult> => {
		const issues: Record<string, unknown> = {};

		const queryString = safeParseField(queryStringSchema, parseQueryString(req.url), issues, "queryString");
		const body = safeParseField(bodySchema, req.body, issues, "body");
		const headers = safeParseField(headersSchema, req.headers, issues, "headers");
		const params = safeParseField(paramsSchema, req.params, issues, "params");
		const cookies = safeParseField(cookiesSchema, req.cookies, issues, "cookies");

		if (Object.keys(issues).length > 0) {
			return { statusCode: 400, data: { error: "validation failed", issues }, cause: issues };
		}

		const typedRequest = { queryString, body, headers, params, cookies } as TypedRequest<
			TQuery,
			TBody,
			THeaders,
			TParams,
			TCookies
		>;

		const result = await handler(typedRequest);
		const statusCode = result.statusCode ?? 200;

		if (!isSuccessHttpCode(statusCode)) {
			return {
				statusCode,
				data: result.data,
				headers: result.headers,
				cookies: result.cookies,
				cause: result.cause,
			};
		}

		const parsedResponse = responseSchema.safeParse(result.data);
		if (!parsedResponse.success) {
			return {
				statusCode: 500,
				data: {
					error: "response validation failed",
					issues: parsedResponse.error.issues,
				},
				cause: parsedResponse.error,
			};
		}

		return {
			statusCode,
			data: parsedResponse.data,
			headers: result.headers,
			cookies: result.cookies,
		};
	};

	return Object.defineProperty(routeHandler, ROUTE_HANDLER_MARKER, {
		value: true,
		enumerable: false,
		writable: false,
		configurable: false,
	}) as RouteHandler;
}

function safeParseField(
	schema: z.ZodType | undefined,
	rawValue: unknown,
	issues: Record<string, unknown>,
	fieldName: string,
): unknown {
	if (!schema) return undefined;
	const result = schema.safeParse(rawValue);
	if (!result.success) {
		issues[fieldName] = result.error.issues;
		return undefined;
	}
	return result.data;
}

function parseQueryString(url: string | undefined): Record<string, string> {
	if (!url) return {};
	const queryIndex = url.indexOf("?");
	if (queryIndex === -1) return {};
	return Object.fromEntries(new URLSearchParams(url.slice(queryIndex + 1)).entries());
}
