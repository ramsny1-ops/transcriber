import { describe, expect, test } from "bun:test";
import {
  assertSecureProductionOrigins,
  buildLocalDevelopmentOrigins,
  isOriginAllowed,
  OriginConfigurationError,
  parseOrigins,
} from "../src/lib/origins";

describe("origin configuration", () => {
  test("parses, normalizes, and deduplicates origins", () => {
    expect(parseOrigins("http://localhost:9367/, http://localhost:9367, https://voice.example.com")).toEqual([
      "http://localhost:9367",
      "https://voice.example.com",
    ]);
  });

  test("rejects paths because an origin is not a full URL", () => {
    expect(() => parseOrigins("https://voice.example.com/app")).toThrow(OriginConfigurationError);
  });

  test("checks normalized request origins", () => {
    const allowed = new Set(["http://localhost:9367"]);
    expect(isOriginAllowed("http://localhost:9367", allowed)).toBe(true);
    expect(isOriginAllowed("http://localhost:9999", allowed)).toBe(false);
  });

  test("always includes separate 9367 client and 9388 server loopback origins", () => {
    expect(buildLocalDevelopmentOrigins(9388, 9367)).toEqual([
      "http://127.0.0.1:9388",
      "http://localhost:9388",
      "http://127.0.0.1:9367",
      "http://localhost:9367",
    ]);
  });

  test("adds LAN development origins without removing loopback defaults", () => {
    const origins = buildLocalDevelopmentOrigins(9388, 9367, "http://192.168.1.127:9367");
    expect(origins).toContain("http://127.0.0.1:9367");
    expect(origins).toContain("http://localhost:9367");
    expect(origins).toContain("http://192.168.1.127:9367");
  });

  test("requires https production origins by default", () => {
    expect(() => assertSecureProductionOrigins(["http://voice.example.com"])).toThrow(
      OriginConfigurationError,
    );
    expect(() => assertSecureProductionOrigins(["https://voice.example.com"])).not.toThrow();
  });
});
