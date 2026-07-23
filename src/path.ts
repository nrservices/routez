export const buildRoutePath = (folderSegments: string[], fileNameSegments: string[] = []): string => {
	const pathSegments = [
		...folderSegments.map(folderSegmentToPathSegment),
		...fileNameSegments.map(fileNameSegmentToPathSegment),
	].filter((segment): segment is string => segment !== null);

	return `/${pathSegments.join("/")}`;
};

const folderSegmentToPathSegment = (name: string): string | null => {
	if (name.startsWith("(") && name.endsWith(")")) {
		return null;
	}

	if (name.startsWith("$")) {
		return `:${name.slice(1)}`;
	}

	return name;
};

// Same syntax as folder segments ($id, (group)), plus "index" - a reserved token meaning
// "no additional segment", used by a route file to target its folder's own path.
const fileNameSegmentToPathSegment = (name: string): string | null => {
	if (name === "index") {
		return null;
	}

	return folderSegmentToPathSegment(name);
};
