import type { RequestHandler } from "express";
import { config } from "../config";
import { isOriginAllowed } from "../lib/origins";

const ALLOWED_METHODS = "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS";
const ALLOWED_HEADERS = "Content-Type,X-CSRF-Token,X-Requested-With";

export const originPolicy: RequestHandler = (req, res, next) => {
	const origin = req.get("origin");

	// Treat missing Origin as same-origin (typical for many browser navigations/forms).
	if (origin) {
		// During development, allow any incoming Origin to simplify tunneling (ngrok)
		// and other proxied dev workflows. Production remains strict.
		if (!config.isProduction) {
			res.vary("Origin");
			res.setHeader("Access-Control-Allow-Origin", origin);
			res.setHeader("Access-Control-Allow-Credentials", "true");
			res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
			res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
			res.setHeader("Access-Control-Max-Age", "600");
		} else {
			const requestOrigin = `${req.protocol}://${req.get("host")}`;

			// Allow true same-origin requests without requiring ALLOWED_ORIGINS to list them.
			if (
				origin !== requestOrigin &&
				!isOriginAllowed(origin, config.allowedOriginSet)
			) {
				// Debug info to help diagnose origin mismatches in development.
				// This will print the incoming Origin header, the computed request origin,
				// and the configured allowed origins set.
				console.warn("origin-policy: rejected request", {
					originHeader: origin,
					requestOrigin: requestOrigin,
					allowedOrigins: Array.from(config.allowedOriginSet),
				});

				return res
					.status(403)
					.json({
						error: "origin_not_allowed",
						message:
							"This browser origin is not allowed to access VoiceWave Studio.",
					});
			}

			res.vary("Origin");
			res.setHeader("Access-Control-Allow-Origin", origin);
			res.setHeader("Access-Control-Allow-Credentials", "true");
			res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
			res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
			res.setHeader("Access-Control-Max-Age", "600");
		}
	}

	if (req.method === "OPTIONS") return res.sendStatus(204);
	return next();
};
