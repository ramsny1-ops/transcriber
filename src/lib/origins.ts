export class OriginConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "OriginConfigurationError";
	}
}

function normalizeOrigin(raw: string) {
	const candidate = raw.trim();
	if (!candidate) return null;

	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		throw new OriginConfigurationError(`Invalid origin: ${candidate}`);
	}

	if (!["http:", "https:"].includes(url.protocol)) {
		throw new OriginConfigurationError(
			`Origin must use http or https: ${candidate}`,
		);
	}

	if (
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	) {
		throw new OriginConfigurationError(
			`Origin must contain only scheme, host, and optional port: ${candidate}`,
		);
	}

	return url.origin;
}

export function parseOrigins(value: string | undefined) {
	if (!value?.trim()) return [] as string[];

	const origins = value
		.split(",")
		.map(normalizeOrigin)
		.filter((origin): origin is string => Boolean(origin));

	return [...new Set(origins)];
}

export function buildLocalDevelopmentOrigins(
	serverPort: number,
	extras?: string,
) {
	const defaults = parseOrigins(
		[`http://127.0.0.1:${serverPort}`, `http://localhost:${serverPort}`].join(
			",",
		),
	);

	return [...new Set([...defaults, ...parseOrigins(extras)])];
}

export function isOriginAllowed(
	origin: string | undefined,
	allowedOrigins: ReadonlySet<string>,
) {
	if (!origin) return true;

	try {
		const normalized = normalizeOrigin(origin);
		return normalized ? allowedOrigins.has(normalized) : true;
	} catch {
		return false;
	}
}

export function assertSecureProductionOrigins(origins: readonly string[]) {
	const insecure = origins.filter((origin) => !origin.startsWith("https://"));
	if (insecure.length > 0) {
		throw new OriginConfigurationError(
			`Production origins must use HTTPS: ${insecure.join(", ")}`,
		);
	}
}
