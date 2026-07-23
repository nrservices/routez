import pino, { type Logger } from "pino";
import { LOGGER_KEY } from "./constants.ts";
import { getContext } from "./context.ts";
import { getGlobalSingleton } from "./utils/globalSingleton.ts";

export type { Logger } from "pino";

const LEVEL_LABELS: Record<number, string> = {
	10: "TRACE",
	20: "DEBUG",
	30: "INFO",
	40: "WARN",
	50: "ERROR",
	60: "FATAL",
};

const LEVEL_COLORS: Record<number, string> = {
	10: "\x1b[90m",
	20: "\x1b[36m",
	30: "\x1b[32m",
	40: "\x1b[33m",
	50: "\x1b[31m",
	60: "\x1b[35m",
};

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

/**
 * `pino-pretty` isn't bundlable the way the rest of this package is: it's loaded through
 * pino's `transport` mechanism, which resolves the target module by name in a worker thread
 * at runtime rather than through a static import a bundler can inline - a consuming project
 * would have to install it itself, breaking the zero-dependency default. This formats the
 * same NDJSON pino already produces, synchronously, in-process, so nothing extra is needed.
 * Exported (rather than an inline closure) so it's directly unit-testable.
 */
export const formatLine = (line: string): string => {
	let record: Record<string, unknown>;
	try {
		record = JSON.parse(line);
	} catch {
		return line;
	}

	const { level, time, msg, pid: _pid, hostname: _hostname, requestId, ...rest } = record;
	const levelNum = typeof level === "number" ? level : 30;
	const label = (LEVEL_LABELS[levelNum] ?? String(level)).padEnd(5);
	const color = LEVEL_COLORS[levelNum] ?? "";
	const timestamp = typeof time === "number" ? new Date(time).toISOString().slice(11, 19) : "";
	const requestIdPart = requestId ? ` ${DIM}[${requestId}]${RESET}` : "";
	const extra = Object.keys(rest).length > 0 ? ` ${DIM}${JSON.stringify(rest)}${RESET}` : "";

	return `${DIM}${timestamp}${RESET} ${color}${label}${RESET}${requestIdPart} ${msg ?? ""}${extra}`;
};

const createPrettyStream = () => ({
	write(chunk: string): boolean {
		for (const line of chunk.split("\n")) {
			if (line) process.stdout.write(`${formatLine(line)}\n`);
		}
		return true;
	},
});

/**
 * `destination` defaults to stdout (plain in production, the formatter above otherwise) -
 * overridable so tests can capture output without touching the shared singleton below.
 */
export const createLogger = (destination?: { write(chunk: string): boolean }): Logger =>
	pino(
		{
			level: process.env.LOG_LEVEL ?? "info",
			mixin() {
				try {
					return { requestId: getContext().requestId };
				} catch {
					return {};
				}
			},
		},
		destination ?? (process.env.NODE_ENV === "production" ? process.stdout : createPrettyStream()),
	);

/**
 * The default logger, shared across every bundle this package is built into (see LOGGER_KEY).
 * A consuming project can override it entirely via `restez.config.ts`'s `logger` option
 * (any pino `Logger` instance, including one built with its own `transport`) rather than
 * configuring this default one - see `RoutingConfig`.
 */
export const logger: Logger = getGlobalSingleton(LOGGER_KEY, () => createLogger());
