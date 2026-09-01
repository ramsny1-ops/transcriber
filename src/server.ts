import { mkdirSync } from "node:fs";
import { config } from "./config";
import { db, migrate } from "./db/database";
import { app } from "./app";

mkdirSync(config.exportDirectory, { recursive: true });
migrate();
db.query("DELETE FROM auth_sessions WHERE expires_at <= ?").run(
	new Date().toISOString(),
);

const server = app.listen(config.serverPort, config.serverHost, () => {
	const displayHost =
		config.serverHost === "0.0.0.0" ? "127.0.0.1" : config.serverHost;
	console.log(
		`VoiceWave Studio listening at http://${displayHost}:${config.serverPort}`,
	);
	console.log(`Environment: ${config.env}`);
	if (!config.isProduction) console.log(`Server running in development mode`);
	console.log(`Allowed browser origins: ${config.allowedOrigins.join(", ")}`);
});

function shutdown(signal: string) {
	console.log(`${signal} received. Closing server.`);
	server.close(() => {
		db.close();
		process.exit(0);
	});
	setTimeout(() => process.exit(1), 8_000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
