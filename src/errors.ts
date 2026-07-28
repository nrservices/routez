import type { DefaultErrorData, ErrorHttpCode } from "./defineRoute.ts";

interface ErrorHandlerResult {
	statusCode: ErrorHttpCode;
	data?: DefaultErrorData;
	cause?: unknown;
}

/**
 * Build an error `HandlerResult` for any non-success status code - see `notFound()` and
 * friends for common cases. `cause` is never sent to the client (it isn't part of `data`) -
 * it rides along on the result so runtime.ts's route handler can log it for 5xx responses.
 */
export function httpError(statusCode: ErrorHttpCode, data?: DefaultErrorData, cause?: unknown): ErrorHandlerResult {
	return { statusCode, data, cause };
}

export function badRequest(data?: DefaultErrorData, cause?: unknown): ErrorHandlerResult {
	return httpError(400, data, cause);
}

export function unauthorized(data?: DefaultErrorData, cause?: unknown): ErrorHandlerResult {
	return httpError(401, data, cause);
}

export function forbidden(data?: DefaultErrorData, cause?: unknown): ErrorHandlerResult {
	return httpError(403, data, cause);
}

export function notFound(data?: DefaultErrorData, cause?: unknown): ErrorHandlerResult {
	return httpError(404, data, cause);
}

export function conflict(data?: DefaultErrorData, cause?: unknown): ErrorHandlerResult {
	return httpError(409, data, cause);
}

export function serverError(data?: DefaultErrorData, cause?: unknown): ErrorHandlerResult {
	return httpError(500, data, cause);
}
