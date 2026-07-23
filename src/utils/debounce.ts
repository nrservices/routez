export const debounce = <TArgs extends unknown[]>(fn: (...args: TArgs) => void, delayMs: number) => {
	let timer: NodeJS.Timeout | undefined;

	return (...args: TArgs): void => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), delayMs);
	};
};
