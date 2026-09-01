import { db, migrate } from "../db/database";

migrate();
db.exec("DELETE FROM auth_sessions WHERE expires_at <= datetime('now'); VACUUM;");
console.log("Expired sessions removed and SQLite database vacuumed.");
