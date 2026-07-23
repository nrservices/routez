export const createRunner = (task: () => Promise<void>) => {
	let running: Promise<void> | undefined;
	let stale = false;

	const run = async (): Promise<void> => {
		do {
			stale = false;
			await task();
		} while (stale);
		running = undefined;
	};

	const schedule = (): Promise<void> => {
		if (running) {
			stale = true;
			return running;
		}
		running = run();
		return running;
	};

	return { schedule, idle: () => running ?? Promise.resolve() };
};
