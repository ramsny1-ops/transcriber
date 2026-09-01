import { describe, expect, test } from "bun:test";
import { defaultPreferences, preferencesSchema } from "../src/lib/preferences";

describe("preferences validation", () => {
  test("defaults remain schema-valid", () => {
    expect(preferencesSchema.safeParse(defaultPreferences).success).toBe(true);
  });

  test("rejects unsafe color values", () => {
    const candidate = { ...defaultPreferences, accentColor: "red; background:url(x)" };
    expect(preferencesSchema.safeParse(candidate).success).toBe(false);
  });

  test("limits keyword rules", () => {
    const candidate = {
      ...defaultPreferences,
      keywordRules: Array.from({ length: 21 }, (_, index) => ({ phrase: `word${index}`, color: "#ffffff" })),
    };
    expect(preferencesSchema.safeParse(candidate).success).toBe(false);
  });
});
