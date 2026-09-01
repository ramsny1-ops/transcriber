export interface CaptionSegmentForExport {
  sequence: number;
  text: string;
  confidence: number | null;
  startMs: number | null;
  endMs: number | null;
}

function clock(ms: number, separator: "," | ".") {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const millis = safe % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
}

function timed(segment: CaptionSegmentForExport, index: number) {
  const start = segment.startMs ?? index * 3_000;
  const end = segment.endMs ?? Math.max(start + 1_500, start + Math.min(6_000, segment.text.length * 75));
  return { start, end };
}

export function exportCaptions(format: "txt" | "json" | "srt" | "vtt", segments: CaptionSegmentForExport[]) {
  if (format === "json") return JSON.stringify({ version: 1, segments }, null, 2) + "\n";
  if (format === "txt") return segments.map((segment) => segment.text.trim()).filter(Boolean).join("\n") + "\n";
  if (format === "srt") {
    return segments.map((segment, index) => {
      const { start, end } = timed(segment, index);
      return `${index + 1}\n${clock(start, ",")} --> ${clock(end, ",")}\n${segment.text.trim()}\n`;
    }).join("\n");
  }
  return "WEBVTT\n\n" + segments.map((segment, index) => {
    const { start, end } = timed(segment, index);
    return `${index + 1}\n${clock(start, ".")} --> ${clock(end, ".")}\n${segment.text.trim()}\n`;
  }).join("\n");
}
