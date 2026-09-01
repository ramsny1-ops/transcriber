import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { config } from "../config";

export const SESSION_COOKIE = "voicewave_session";

export function randomId() {
  return crypto.randomUUID();
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string | Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

function signature(value: string) {
  return createHmac("sha256", config.appSecret).update(value).digest("base64url");
}

export function createFormCsrf() {
  const body = `${Date.now()}.${randomToken(18)}`;
  return `${body}.${signature(body)}`;
}

export function verifyFormCsrf(token: unknown, maxAgeMs = 15 * 60 * 1000) {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [timestamp, nonce, supplied] = parts;
  if (!timestamp || !nonce || !supplied) return false;
  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return false;
  const expected = signature(`${timestamp}.${nonce}`);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    path: "/",
  });
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function escapeFileName(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "captions";
}
