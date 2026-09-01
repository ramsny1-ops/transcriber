import type { NextFunction, Request, Response } from "express";

export function notFound(req: Request, res: Response) {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not_found" });
  return res.status(404).render("error", { title: "Not found", status: 404, message: "That page does not exist." });
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  console.error(error);
  if (res.headersSent) return;
  if (req.path.startsWith("/api/")) return res.status(500).json({ error: "internal_server_error" });
  return res.status(500).render("error", { title: "Server error", status: 500, message: "The server could not complete the request." });
}
