import { z } from "zod";

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const keywordRuleSchema = z.object({
  phrase: z.string().trim().min(1).max(40),
  color: hexColor,
});

export const preferencesSchema = z.object({
  backgroundMode: z.enum(["oscilloscope", "bands", "grid", "solid"]),
  backgroundColor: hexColor,
  waveColor: hexColor,
  accentColor: hexColor,
  captionColor: hexColor,
  captionFont: z.enum(["system", "humanist", "mono", "serif", "rounded"]),
  captionSize: z.number().int().min(28).max(120),
  captionWeight: z.number().int().min(400).max(900),
  captionAlign: z.enum(["left", "center", "right"]),
  captionCase: z.enum(["natural", "upper", "lower"]),
  captionShadow: z.boolean(),
  recognitionLang: z.string().trim().min(2).max(20),
  ttsVoice: z.string().max(200).nullable(),
  ttsLang: z.string().trim().min(2).max(20),
  ttsRate: z.number().min(0.5).max(2),
  ttsPitch: z.number().min(0).max(2),
  ttsVolume: z.number().min(0).max(1),
  ttsTone: z.enum(["neutral", "calm", "deep", "bright", "urgent"]),
  keywordRules: z.array(keywordRuleSchema).max(20),
});

export type UserPreferences = z.infer<typeof preferencesSchema>;

export const defaultPreferences: UserPreferences = {
  backgroundMode: "oscilloscope",
  backgroundColor: "#090b0c",
  waveColor: "#f0f2ed",
  accentColor: "#9ed36a",
  captionColor: "#f7f7f2",
  captionFont: "system",
  captionSize: 56,
  captionWeight: 700,
  captionAlign: "center",
  captionCase: "natural",
  captionShadow: true,
  recognitionLang: "en-US",
  ttsVoice: null,
  ttsLang: "en-US",
  ttsRate: 1,
  ttsPitch: 1,
  ttsVolume: 1,
  ttsTone: "neutral",
  keywordRules: [
    { phrase: "important", color: "#f3c969" },
    { phrase: "warning", color: "#ff7b72" },
    { phrase: "success", color: "#9ed36a" }
  ],
};
