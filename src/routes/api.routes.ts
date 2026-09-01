import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import express from "express";
import { dirname, join, relative, resolve } from "node:path";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { db } from "../db/database";
import { exportCaptions, type CaptionSegmentForExport } from "../lib/exporters";
import {
	defaultPreferences,
	keywordRuleSchema,
	preferencesSchema,
	type UserPreferences,
} from "../lib/preferences";
import { escapeFileName, randomId } from "../lib/security";
import { requireAuth, requireCsrf } from "../middleware/auth";

export const apiRouter = Router();
apiRouter.use(requireAuth);

interface PreferenceRow {
	background_mode: string;
	background_color: string;
	wave_color: string;
	accent_color: string;
	caption_color: string;
	caption_font: string;
	caption_size: number;
	caption_weight: number;
	caption_align: string;
	caption_case: string;
	caption_shadow: number;
	recognition_lang: string;
	tts_voice: string | null;
	tts_lang: string;
	tts_rate: number;
	tts_pitch: number;
	tts_volume: number;
	tts_tone: string;
	keyword_rules_json: string;
}

function readPreferences(userId: string): UserPreferences {
	const row = db
		.query<
			PreferenceRow,
			[string]
		>("SELECT * FROM user_preferences WHERE user_id = ?")
		.get(userId);
	if (!row) return defaultPreferences;

	let keywordRules: unknown = [];
	try {
		keywordRules = JSON.parse(row.keyword_rules_json);
	} catch {
		keywordRules = [];
	}

	const candidate = {
		backgroundMode: row.background_mode,
		backgroundColor: row.background_color,
		waveColor: row.wave_color,
		accentColor: row.accent_color,
		captionColor: row.caption_color,
		captionFont: row.caption_font,
		captionSize: row.caption_size,
		captionWeight: row.caption_weight,
		captionAlign: row.caption_align,
		captionCase: row.caption_case,
		captionShadow: Boolean(row.caption_shadow),
		recognitionLang: row.recognition_lang,
		ttsVoice: row.tts_voice,
		ttsLang: row.tts_lang,
		ttsRate: row.tts_rate,
		ttsPitch: row.tts_pitch,
		ttsVolume: row.tts_volume,
		ttsTone: row.tts_tone,
		keywordRules,
	};

	return preferencesSchema.safeParse(candidate).success
		? preferencesSchema.parse(candidate)
		: defaultPreferences;
}

apiRouter.get("/me", (req, res) => {
	return res.json({ user: req.auth!.user, csrfToken: req.auth!.csrfToken });
});

apiRouter.get("/preferences", (req, res) => {
	return res.json({ preferences: readPreferences(req.auth!.user.id) });
});

apiRouter.put("/preferences", requireCsrf, (req, res) => {
	const parsed = preferencesSchema.safeParse(req.body);
	if (!parsed.success)
		return res
			.status(422)
			.json({ error: "invalid_preferences", details: parsed.error.flatten() });
	const p = parsed.data;
	const now = new Date().toISOString();

	db.query(
		`
    INSERT INTO user_preferences (
      user_id, background_mode, background_color, wave_color, accent_color,
      caption_color, caption_font, caption_size, caption_weight, caption_align,
      caption_case, caption_shadow, recognition_lang, tts_voice, tts_lang,
      tts_rate, tts_pitch, tts_volume, tts_tone, keyword_rules_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      background_mode = excluded.background_mode,
      background_color = excluded.background_color,
      wave_color = excluded.wave_color,
      accent_color = excluded.accent_color,
      caption_color = excluded.caption_color,
      caption_font = excluded.caption_font,
      caption_size = excluded.caption_size,
      caption_weight = excluded.caption_weight,
      caption_align = excluded.caption_align,
      caption_case = excluded.caption_case,
      caption_shadow = excluded.caption_shadow,
      recognition_lang = excluded.recognition_lang,
      tts_voice = excluded.tts_voice,
      tts_lang = excluded.tts_lang,
      tts_rate = excluded.tts_rate,
      tts_pitch = excluded.tts_pitch,
      tts_volume = excluded.tts_volume,
      tts_tone = excluded.tts_tone,
      keyword_rules_json = excluded.keyword_rules_json,
      updated_at = excluded.updated_at
  `,
	).run(
		req.auth!.user.id,
		p.backgroundMode,
		p.backgroundColor,
		p.waveColor,
		p.accentColor,
		p.captionColor,
		p.captionFont,
		p.captionSize,
		p.captionWeight,
		p.captionAlign,
		p.captionCase,
		p.captionShadow ? 1 : 0,
		p.recognitionLang,
		p.ttsVoice,
		p.ttsLang,
		p.ttsRate,
		p.ttsPitch,
		p.ttsVolume,
		p.ttsTone,
		JSON.stringify(p.keywordRules),
		now,
	);

	return res.json({ ok: true, preferences: p });
});

const createSessionSchema = z.object({
	title: z.string().trim().min(1).max(100).default("Untitled capture"),
	language: z.string().trim().min(2).max(20),
});

apiRouter.post("/caption-sessions", requireCsrf, (req, res) => {
	const parsed = createSessionSchema.safeParse(req.body);
	if (!parsed.success)
		return res.status(422).json({ error: "invalid_session" });
	const id = randomId();
	const now = new Date().toISOString();
	db.query(
		`
    INSERT INTO caption_sessions (id, user_id, title, language, status, started_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
  `,
	).run(
		id,
		req.auth!.user.id,
		parsed.data.title,
		parsed.data.language,
		now,
		now,
		now,
	);
	return res.status(201).json({ id, startedAt: now });
});

const segmentSchema = z.object({
	sequence: z.number().int().min(0).max(1_000_000),
	text: z.string().trim().min(1).max(5_000),
	confidence: z.number().min(0).max(1).nullable().optional(),
	startMs: z.number().int().min(0).nullable().optional(),
	endMs: z.number().int().min(0).nullable().optional(),
});

apiRouter.post("/caption-sessions/:id/segments", requireCsrf, (req, res) => {
	const parsed = segmentSchema.safeParse(req.body);
	if (!parsed.success)
		return res.status(422).json({ error: "invalid_segment" });
	const owned = db
		.query<
			{ id: string },
			[string, string]
		>("SELECT id FROM caption_sessions WHERE id = ? AND user_id = ?")
		.get(req.params.id, req.auth!.user.id);
	if (!owned) return res.status(404).json({ error: "session_not_found" });

	const s = parsed.data;
	db.query(
		`
    INSERT INTO caption_segments (id, session_id, user_id, sequence, text, confidence, start_ms, end_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, sequence) DO UPDATE SET
      text = excluded.text,
      confidence = excluded.confidence,
      start_ms = excluded.start_ms,
      end_ms = excluded.end_ms
  `,
	).run(
		randomId(),
		req.params.id,
		req.auth!.user.id,
		s.sequence,
		s.text,
		s.confidence ?? null,
		s.startMs ?? null,
		s.endMs ?? null,
		new Date().toISOString(),
	);
	return res.status(201).json({ ok: true });
});

// Accept raw audio uploads (e.g., audio/webm) for a session recording.
apiRouter.post(
	"/caption-sessions/:id/recording",
	requireCsrf,
	express.raw({ type: "audio/*", limit: "40mb" }),
	async (req, res, next) => {
		try {
			const owned = db
				.query<
					{ id: string },
					[string, string]
				>("SELECT id FROM caption_sessions WHERE id = ? AND user_id = ?")
				.get(req.params.id, req.auth!.user.id);
			if (!owned) return res.status(404).json({ error: "session_not_found" });

			if (
				!req.body ||
				!(req.body instanceof Uint8Array) ||
				req.body.length === 0
			) {
				return res.status(422).json({ error: "invalid_recording" });
			}

			const exportId = randomId();
			const fileName = `recording-${exportId.slice(0, 8)}.webm`;
			const absolute = join(
				config.exportDirectory,
				req.auth!.user.id,
				req.params.id,
				fileName,
			);
			await mkdir(dirname(absolute), { recursive: true });
			await writeFile(absolute, req.body);

			db.query(
				"INSERT INTO caption_exports (id, user_id, session_id, format, relative_path, bytes, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			).run(
				exportId,
				req.auth!.user.id,
				req.params.id,
				"webm",
				relative(config.exportDirectory, absolute),
				(await stat(absolute)).size,
				createHash("sha256")
					.update(await readFile(absolute))
					.digest("hex"),
				new Date().toISOString(),
			);

			const downloadUrl = `/api/v1/exports/${exportId}`;

			// If an OpenAI API key is configured, kick off transcription now and store segments.
			const openaiKey = process.env.OPENAI_API_KEY;
			if (openaiKey) {
				(async () => {
					try {
						const fileBuffer = await readFile(absolute);
						const form = new FormData();
						form.append("file", new Blob([fileBuffer]), fileName);
						form.append("model", "whisper-1");
						form.append("response_format", "verbose_json");

						const resp = await fetch(
							"https://api.openai.com/v1/audio/transcriptions",
							{
								method: "POST",
								headers: { Authorization: `Bearer ${openaiKey}` },
								body: form as any,
							},
						);

						if (!resp.ok) {
							console.warn("transcription failed", await resp.text());
							return;
						}

						const result = await resp.json();
						const segments: Array<{
							start?: number;
							end?: number;
							text?: string;
						}> = result.segments ?? [];
						if (!segments.length) return;

						let seq = 0;
						const now = new Date().toISOString();
						for (const s of segments) {
							const startMs =
								typeof s.start === "number" ? Math.round(s.start * 1000) : null;
							const endMs =
								typeof s.end === "number" ? Math.round(s.end * 1000) : null;
							db.query(
								`
			  INSERT INTO caption_segments (id, session_id, user_id, sequence, text, confidence, start_ms, end_ms, created_at)
			  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			  ON CONFLICT(session_id, sequence) DO UPDATE SET
				text = excluded.text,
				confidence = excluded.confidence,
				start_ms = excluded.start_ms,
				end_ms = excluded.end_ms
			`,
							).run(
								randomId(),
								req.params.id,
								req.auth!.user.id,
								seq++,
								(s.text ?? "").trim(),
								null,
								startMs,
								endMs,
								now,
							);
						}
					} catch (err) {
						console.warn("automatic transcription error", err);
					}
				})();
			}

			return res.status(201).json({ ok: true, downloadUrl });
		} catch (error) {
			next(error);
		}
	},
);

apiRouter.patch("/caption-sessions/:id", requireCsrf, (req, res) => {
	const title =
		typeof req.body?.title === "string"
			? req.body.title.trim().slice(0, 100)
			: undefined;
	const now = new Date().toISOString();
	const result = title
		? db
				.query(
					"UPDATE caption_sessions SET title = ?, status = 'complete', ended_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
				)
				.run(
					title || "Untitled capture",
					now,
					now,
					req.params.id,
					req.auth!.user.id,
				)
		: db
				.query(
					"UPDATE caption_sessions SET status = 'complete', ended_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
				)
				.run(now, now, req.params.id, req.auth!.user.id);
	if (result.changes === 0)
		return res.status(404).json({ error: "session_not_found" });
	return res.json({ ok: true, endedAt: now });
});

apiRouter.get("/caption-sessions", (req, res) => {
	const rows = db
		.query(
			`
    SELECT s.id, s.title, s.language, s.status, s.started_at AS startedAt, s.ended_at AS endedAt,
      COUNT(seg.id) AS segmentCount
    FROM caption_sessions s
    LEFT JOIN caption_segments seg ON seg.session_id = s.id
    WHERE s.user_id = ?
    GROUP BY s.id
    ORDER BY s.created_at DESC
    LIMIT 100
  `,
		)
		.all(req.auth!.user.id);
	return res.json({ sessions: rows });
});

apiRouter.get("/caption-sessions/:id", (req, res) => {
	const session = db
		.query(
			"SELECT id, title, language, status, started_at AS startedAt, ended_at AS endedAt FROM caption_sessions WHERE id = ? AND user_id = ?",
		)
		.get(req.params.id, req.auth!.user.id);
	if (!session) return res.status(404).json({ error: "session_not_found" });
	const segments = db
		.query(
			"SELECT sequence, text, confidence, start_ms AS startMs, end_ms AS endMs FROM caption_segments WHERE session_id = ? AND user_id = ? ORDER BY sequence",
		)
		.all(req.params.id, req.auth!.user.id);
	return res.json({ session, segments });
});

apiRouter.delete("/caption-sessions/:id", requireCsrf, (req, res) => {
	const result = db
		.query("DELETE FROM caption_sessions WHERE id = ? AND user_id = ?")
		.run(req.params.id, req.auth!.user.id);
	if (result.changes === 0)
		return res.status(404).json({ error: "session_not_found" });
	return res.status(204).end();
});

const exportSchema = z.object({
	format: z.enum(["txt", "json", "srt", "vtt"]),
});

apiRouter.post(
	"/caption-sessions/:id/export",
	requireCsrf,
	async (req, res, next) => {
		try {
			const parsed = exportSchema.safeParse(req.body);
			if (!parsed.success)
				return res.status(422).json({ error: "invalid_export_format" });

			const session = db
				.query<
					{ id: string; title: string },
					[string, string]
				>("SELECT id, title FROM caption_sessions WHERE id = ? AND user_id = ?")
				.get(req.params.id, req.auth!.user.id);
			if (!session) return res.status(404).json({ error: "session_not_found" });

			const segments = db
				.query<CaptionSegmentForExport, [string, string]>(
					`
      SELECT sequence, text, confidence, start_ms AS startMs, end_ms AS endMs
      FROM caption_segments WHERE session_id = ? AND user_id = ? ORDER BY sequence
    `,
				)
				.all(session.id, req.auth!.user.id);
			if (!segments.length)
				return res.status(409).json({ error: "session_has_no_captions" });

			const content = exportCaptions(parsed.data.format, segments);
			const exportId = randomId();
			const fileName = `${escapeFileName(session.title)}-${exportId.slice(0, 8)}.${parsed.data.format}`;
			const absolute = join(
				config.exportDirectory,
				req.auth!.user.id,
				session.id,
				fileName,
			);
			await mkdir(dirname(absolute), { recursive: true });
			await writeFile(absolute, content, "utf8");
			const fileStat = await stat(absolute);
			const digest = createHash("sha256")
				.update(await readFile(absolute))
				.digest("hex");
			const relativePath = relative(config.exportDirectory, absolute);

			db.query(
				"INSERT INTO caption_exports (id, user_id, session_id, format, relative_path, bytes, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			).run(
				exportId,
				req.auth!.user.id,
				session.id,
				parsed.data.format,
				relativePath,
				fileStat.size,
				digest,
				new Date().toISOString(),
			);

			return res
				.status(201)
				.json({
					id: exportId,
					format: parsed.data.format,
					bytes: fileStat.size,
					sha256: digest,
					downloadUrl: `/api/v1/exports/${exportId}`,
				});
		} catch (error) {
			next(error);
		}
	},
);

apiRouter.get("/exports/:id", async (req, res, next) => {
	try {
		const row = db
			.query<
				{ relative_path: string; format: string },
				[string, string]
			>("SELECT relative_path, format FROM caption_exports WHERE id = ? AND user_id = ?")
			.get(req.params.id, req.auth!.user.id);
		if (!row) return res.status(404).json({ error: "export_not_found" });

		const absolute = resolve(config.exportDirectory, row.relative_path);
		const root = resolve(config.exportDirectory) + "/";
		if (!absolute.startsWith(root))
			return res.status(400).json({ error: "invalid_export_path" });
		return res.download(absolute);
	} catch (error) {
		next(error);
	}
});
