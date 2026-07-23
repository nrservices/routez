export interface RequestLike {
	url?: string;
	headers: Record<string, string | string[] | undefined>;
	params?: unknown;
	body?: unknown;
	cookies?: unknown;
}
