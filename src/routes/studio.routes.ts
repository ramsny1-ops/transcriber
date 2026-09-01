import { Router } from "express";
import { db } from "../db/database";
import { requireAuth } from "../middleware/auth";

export const studioRouter = Router();

studioRouter.get("/", (req, res) => {
  return res.redirect(req.auth ? "/studio" : "/login");
});

studioRouter.get("/studio", requireAuth, (req, res) => {
  return res.render("studio", {
    title: "VoiceWave Studio",
    user: req.auth!.user,
    csrfToken: req.auth!.csrfToken,
  });
});

studioRouter.get("/history", requireAuth, (req, res) => {
  const sessions = db.query<{
    id: string;
    title: string;
    language: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    segment_count: number;
  }, [string]>(`
    SELECT s.id, s.title, s.language, s.status, s.started_at, s.ended_at,
      COUNT(seg.id) AS segment_count
    FROM caption_sessions s
    LEFT JOIN caption_segments seg ON seg.session_id = s.id
    WHERE s.user_id = ?
    GROUP BY s.id
    ORDER BY s.created_at DESC
    LIMIT 100
  `).all(req.auth!.user.id);

  return res.render("history", {
    title: "Caption history",
    user: req.auth!.user,
    csrfToken: req.auth!.csrfToken,
    sessions,
  });
});
