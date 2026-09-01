import { describe, expect, test } from "bun:test";
import { exportCaptions } from "../src/lib/exporters";

const segments = [
  { sequence: 0, text: "Hello world", confidence: 0.97, startMs: 0, endMs: 1_500 },
  { sequence: 1, text: "Second line", confidence: 0.93, startMs: 1_600, endMs: 3_000 },
];

describe("caption exporters", () => {
  test("TXT contains each final segment", () => {
    expect(exportCaptions("txt", segments)).toBe("Hello world\nSecond line\n");
  });

  test("SRT writes numbered cues and comma timestamps", () => {
    const output = exportCaptions("srt", segments);
    expect(output).toContain("1\n00:00:00,000 --> 00:00:01,500\nHello world");
    expect(output).toContain("2\n00:00:01,600 --> 00:00:03,000\nSecond line");
  });

  test("WebVTT starts with header", () => {
    expect(exportCaptions("vtt", segments)).toStartWith("WEBVTT\n\n");
  });
});
