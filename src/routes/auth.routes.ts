import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../config";
import { db } from "../db/database";
import { requireAuth, requireCsrf } from "../middleware/auth";
import {
  clearSessionCookie,
  createFormCsrf,
  normalizeEmail,
  randomId,
  randomToken,
  setSessionCookie,
  sha256,
  verifyFormCsrf,
} from "../lib/security";
import { defaultPreferences } from "../lib/preferences";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: "Too many authentication attempts. Try again later.",
});

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
});

const registerSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(2).max(60),
});

function createAuthSession(userId: string, userAgent: string | undefined) {
  const id = randomId();
  const token = randomToken();
  const csrfToken = randomToken(24);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.sessionTtlHours * 60 * 60 * 1000);

  db.query(`
    INSERT INTO auth_sessions
      (id, user_id, token_hash, csrf_token, user_agent, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    sha256(token),
    csrfToken,
    userAgent?.slice(0, 240) ?? null,
    createdAt.toISOString(),
    createdAt.toISOString(),
    expiresAt.toISOString(),
  );

  return { id, token, csrfToken, expiresAt };
}

function renderRegister(res: Response, error: string | null, values: Record<string, unknown> = {}) {
  return res.render("register", { title: "Create account", error, values, csrf: createFormCsrf() });
}

function renderLogin(res: Response, error: string | null, email = "") {
  return res.render("login", { title: "Sign in", error, email, csrf: createFormCsrf() });
}

authRouter.get("/register", (req, res) => {
  if (req.auth) return res.redirect("/studio");
  return renderRegister(res, null);
});

authRouter.post("/register", authLimiter, async (req, res) => {
  if (!verifyFormCsrf(req.body?._csrf)) return renderRegister(res, "The form expired. Please try again.", req.body);

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return renderRegister(res, "Use a valid email, a display name, and a password with at least 10 characters.", req.body);
  }

  const email = normalizeEmail(parsed.data.email);
  const existing = db.query<{ id: string }, [string]>("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return renderRegister(res, "An account with that email already exists.", { email, displayName: parsed.data.displayName });

  const now = new Date().toISOString();
  const userId = randomId();
  const passwordHash = await Bun.password.hash(parsed.data.password);

  const insertUser = db.transaction(() => {
    db.query("INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(userId, email, parsed.data.displayName, passwordHash, now, now);

    db.query(`
      INSERT INTO user_preferences (
        user_id, background_mode, background_color, wave_color, accent_color,
        caption_color, caption_font, caption_size, caption_weight, caption_align,
        caption_case, caption_shadow, recognition_lang, tts_voice, tts_lang,
        tts_rate, tts_pitch, tts_volume, tts_tone, keyword_rules_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      defaultPreferences.backgroundMode,
      defaultPreferences.backgroundColor,
      defaultPreferences.waveColor,
      defaultPreferences.accentColor,
      defaultPreferences.captionColor,
      defaultPreferences.captionFont,
      defaultPreferences.captionSize,
      defaultPreferences.captionWeight,
      defaultPreferences.captionAlign,
      defaultPreferences.captionCase,
      defaultPreferences.captionShadow ? 1 : 0,
      defaultPreferences.recognitionLang,
      defaultPreferences.ttsVoice,
      defaultPreferences.ttsLang,
      defaultPreferences.ttsRate,
      defaultPreferences.ttsPitch,
      defaultPreferences.ttsVolume,
      defaultPreferences.ttsTone,
      JSON.stringify(defaultPreferences.keywordRules),
      now,
    );

    db.query("INSERT INTO audit_events (id, user_id, event_type, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(randomId(), userId, "account.registered", "{}", now);
  });

  insertUser();
  const session = createAuthSession(userId, req.get("user-agent"));
  setSessionCookie(res, session.token, session.expiresAt);
  return res.redirect("/studio");
});

authRouter.get("/login", (req, res) => {
  if (req.auth) return res.redirect("/studio");
  return renderLogin(res, null);
});

authRouter.post("/login", authLimiter, async (req, res) => {
  if (!verifyFormCsrf(req.body?._csrf)) return renderLogin(res, "The form expired. Please try again.", req.body?.email ?? "");

  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return renderLogin(res, "Email or password is incorrect.", req.body?.email ?? "");

  const email = normalizeEmail(parsed.data.email);
  const user = db.query<{ id: string; password_hash: string }, [string]>("SELECT id, password_hash FROM users WHERE email = ?").get(email);
  const valid = user ? await Bun.password.verify(parsed.data.password, user.password_hash) : false;
  if (!user || !valid) return renderLogin(res, "Email or password is incorrect.", email);

  db.query("DELETE FROM auth_sessions WHERE user_id = ? AND expires_at <= ?").run(user.id, new Date().toISOString());
  const session = createAuthSession(user.id, req.get("user-agent"));
  setSessionCookie(res, session.token, session.expiresAt);
  db.query("INSERT INTO audit_events (id, user_id, event_type, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(randomId(), user.id, "account.login", "{}", new Date().toISOString());
  return res.redirect("/studio");
});

authRouter.post("/logout", requireAuth, requireCsrf, (req, res) => {
  db.query("DELETE FROM auth_sessions WHERE id = ?").run(req.auth!.sessionId);
  clearSessionCookie(res);
  return res.redirect("/login");
});
