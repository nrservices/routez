export const tryCatch = async <T>(fn: () => Promise<T>): Promise<[T | undefined, Error | undefined]> => {
	try {
		const result = await fn();
		return [result, undefined];
	} catch (error: unknown) {
		const err = error instanceof Error ? error : new Error(String(error));
		return [undefined, err];
	}
};
