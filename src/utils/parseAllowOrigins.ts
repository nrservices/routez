export const parseAllowOrigins = (raw: string | string[] | undefined): string[] => {
	const origins = Array.isArray(raw) ? raw : (raw ?? "").split(",");
	return origins.map((origin) => origin.trim()).filter((origin) => origin.length > 0);
};
