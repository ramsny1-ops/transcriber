import compression from "compression";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { join } from "node:path";
import { config } from "./config";
import { loadAuth } from "./middleware/auth";
import { errorHandler, notFound } from "./middleware/errors";
import { originPolicy } from "./middleware/origin-policy";
import { apiRouter } from "./routes/api.routes";
import { authRouter } from "./routes/auth.routes";
import { studioRouter } from "./routes/studio.routes";

export const app = express();

if (config.trustProxy) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", join(import.meta.dir, "../views"));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      styleSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "microphone=(self), on-device-speech-recognition=(self)");
  next();
});
app.use(compression());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(originPolicy);
app.use(express.static(join(import.meta.dir, "../public"), { maxAge: config.env === "production" ? "1d" : 0, etag: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));
app.use(loadAuth);

app.get("/health", (_req, res) => res.json({ status: "ok", service: "voice-wave-studio" }));
app.use(authRouter);
app.use(studioRouter);
app.use("/api/v1", apiRouter);
app.use(notFound);
app.use(errorHandler);
