import type { NextFunction, Request, Response } from "express";
import { db } from "../db/database";
import { clearSessionCookie, readCookie, SESSION_COOKIE, sha256 } from "../lib/security";

interface SessionRow {
  id: string;
  user_id: string;
  csrf_token: string;
  expires_at: string;
  email: string;
  display_name: string;
}

export function loadAuth(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token) return next();

  const row = db.query<SessionRow, [string]>(`
    SELECT s.id, s.user_id, s.csrf_token, s.expires_at, u.email, u.display_name
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(sha256(token));

  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    if (row) db.query("DELETE FROM auth_sessions WHERE id = ?").run(row.id);
    clearSessionCookie(res);
    return next();
  }

  req.auth = {
    user: { id: row.user_id, email: row.email, displayName: row.display_name },
    sessionId: row.id,
    csrfToken: row.csrf_token,
  };

  db.query("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.auth) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "authentication_required" });
  return res.redirect("/login");
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: "authentication_required" });
  const supplied = req.get("x-csrf-token") ?? req.body?._csrf;
  if (typeof supplied !== "string" || supplied !== req.auth.csrfToken) {
    return res.status(403).json({ error: "invalid_csrf_token" });
  }
  next();
}
