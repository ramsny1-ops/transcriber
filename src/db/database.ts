import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config";

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath, {
	create: true,
	strict: true,
});

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
`);

export function migrate() {
	db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      background_mode TEXT NOT NULL DEFAULT 'oscilloscope',
      background_color TEXT NOT NULL DEFAULT '#090b0c',
      wave_color TEXT NOT NULL DEFAULT '#f0f2ed',
      accent_color TEXT NOT NULL DEFAULT '#9ed36a',
      caption_color TEXT NOT NULL DEFAULT '#f7f7f2',
      caption_font TEXT NOT NULL DEFAULT 'system',
      caption_size INTEGER NOT NULL DEFAULT 56,
      caption_weight INTEGER NOT NULL DEFAULT 700,
      caption_align TEXT NOT NULL DEFAULT 'center',
      caption_case TEXT NOT NULL DEFAULT 'natural',
      caption_shadow INTEGER NOT NULL DEFAULT 1,
      recognition_lang TEXT NOT NULL DEFAULT 'en-US',
      tts_voice TEXT,
      tts_lang TEXT NOT NULL DEFAULT 'en-US',
      tts_rate REAL NOT NULL DEFAULT 1.0,
      tts_pitch REAL NOT NULL DEFAULT 1.0,
      tts_volume REAL NOT NULL DEFAULT 1.0,
      tts_tone TEXT NOT NULL DEFAULT 'neutral',
      keyword_rules_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS caption_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      language TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'complete')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS caption_segments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      text TEXT NOT NULL,
      confidence REAL,
      start_ms INTEGER,
      end_ms INTEGER,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, sequence),
      FOREIGN KEY(session_id) REFERENCES caption_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS caption_exports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      -- allow audio recordings (webm) in addition to caption export formats
      format TEXT NOT NULL CHECK(format IN ('txt', 'json', 'srt', 'vtt', 'webm')),
      relative_path TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(session_id) REFERENCES caption_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      event_type TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_caption_sessions_user_created ON caption_sessions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_caption_segments_session_sequence ON caption_segments(session_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_exports_user_created ON caption_exports(user_id, created_at DESC);
  `);

	// If an existing caption_exports table used an older CHECK constraint that
	// did not include 'webm', migrate it to the new schema. This preserves data
	// while updating the allowed formats. This operation is safe but only runs
	// when the stored schema differs.
	try {
		const row = db
			.query<
				{ sql: string },
				[string]
			>(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`)
			.get("caption_exports");
		if (row && !row.sql.includes("'webm'")) {
			db.exec(`
        BEGIN TRANSACTION;
        CREATE TABLE IF NOT EXISTS caption_exports_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          format TEXT NOT NULL CHECK(format IN ('txt', 'json', 'srt', 'vtt', 'webm')),
          relative_path TEXT NOT NULL,
          bytes INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY(session_id) REFERENCES caption_sessions(id) ON DELETE CASCADE
        );
        INSERT INTO caption_exports_new (id, user_id, session_id, format, relative_path, bytes, sha256, created_at)
          SELECT id, user_id, session_id, format, relative_path, bytes, sha256, created_at FROM caption_exports;
        DROP TABLE caption_exports;
        ALTER TABLE caption_exports_new RENAME TO caption_exports;
        COMMIT;
      `);
		}
	} catch (e) {
		// If migration fails, log and continue; runtime inserts will handle errors.
		console.warn("caption_exports migration skipped or failed:", e);
	}
}
