import { resolve } from "node:path";
import {
	assertSecureProductionOrigins,
	buildLocalDevelopmentOrigins,
	parseOrigins,
} from "./lib/origins";

const int = (value: string | undefined, fallback: number) => {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value: string | undefined, fallback = false) => {
	if (value == null) return fallback;
	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const env = process.env.NODE_ENV ?? "development";
const isProduction = env === "production";
const serverHost = process.env.SERVER_HOST ?? process.env.HOST ?? "127.0.0.1";
const serverPort = int(process.env.SERVER_PORT ?? process.env.PORT, 9367);

// Always keep loopback origins for both the API/server port and the separate
// browser-client port during development. ALLOWED_ORIGINS_LOCAL adds to these
// defaults instead of accidentally replacing them.
const localAllowedOrigins = buildLocalDevelopmentOrigins(
	serverPort,
	process.env.ALLOWED_ORIGINS_LOCAL,
);
const productionAllowedOrigins = parseOrigins(
	process.env.ALLOWED_ORIGINS_PRODUCTION,
);
const commonAllowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);

// ALLOWED_ORIGINS is additive. It must never silently erase the safe local
// defaults or the production-specific list.
const selectedOrigins = [
	...new Set([
		...(isProduction ? productionAllowedOrigins : localAllowedOrigins),
		...commonAllowedOrigins,
	]),
];

if (isProduction && selectedOrigins.length === 0) {
	throw new Error(
		"Production requires ALLOWED_ORIGINS_PRODUCTION or ALLOWED_ORIGINS to contain at least one HTTPS origin.",
	);
}

if (isProduction && !bool(process.env.ALLOW_INSECURE_PRODUCTION_ORIGINS)) {
	assertSecureProductionOrigins(selectedOrigins);
}

const secret =
	process.env.APP_SECRET ?? "development-only-change-me-development-only";
if (isProduction && secret.length < 32) {
	throw new Error("APP_SECRET must be at least 32 characters in production.");
}

export const config = Object.freeze({
	env,
	isProduction,
	serverHost,
	serverPort,
	// clientPort intentionally omitted; server and client are same application
	allowedOrigins: Object.freeze(selectedOrigins),
	allowedOriginSet: new Set(selectedOrigins) as ReadonlySet<string>,
	databasePath: resolve(
		process.env.DATABASE_PATH ?? "./data/voice-wave.sqlite",
	),
	exportDirectory: resolve(process.env.EXPORT_DIRECTORY ?? "./data/exports"),
	sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 168),
	appSecret: secret,
	trustProxy: bool(process.env.TRUST_PROXY),
	secureCookies: isProduction,
});
