const MAX_BYTES = 10 * 1024 * 1024;

export type ResumeMedia = {
  mediaType: string;
  kind: "pdf" | "docx" | "txt";
};

export function detectResumeMedia(fileName: string, bytes: Buffer): ResumeMedia | null {
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
  const name = fileName.toLowerCase();
  if (bytes.subarray(0, 5).toString("utf8") === "%PDF-") {
    return { mediaType: "application/pdf", kind: "pdf" };
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (name.endsWith(".docx") || name.endsWith(".doc"))) {
    return {
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      kind: "docx",
    };
  }
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    if (bytes.includes(0)) return null;
    return { mediaType: "text/plain", kind: "txt" };
  }
  const asText = bytes.toString("utf8");
  if (!asText.includes("\u0000") && /resume|experience|skills|education/i.test(asText)) {
    return { mediaType: "text/plain", kind: "txt" };
  }
  return null;
}

export { MAX_BYTES as MAX_RESUME_BYTES };
