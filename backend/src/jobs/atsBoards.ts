/** Pull Greenhouse / Lever / Ashby board slugs from raw slugs or careers URLs. */
export function parseBoardSlug(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    const forParam = url.searchParams.get("for");
    if (host.includes("greenhouse.io") || host.includes("greenhouse.com")) {
      return sanitizeSlug(forParam || segments[0] || "");
    }
    if (host.includes("lever.co")) return sanitizeSlug(segments[0] || "");
    if (host.includes("ashbyhq.com")) return sanitizeSlug(segments[0] || "");
  } catch {
    // Not a URL — treat as a bare slug.
  }
  return sanitizeSlug(trimmed);
}

export function parseBoardList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const slug = parseBoardSlug(part);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
  }
  return result;
}

export function joinBoardList(slugs: string[]): string {
  return slugs.join(", ");
}

export function mergeBoardLists(...values: Array<string | null | undefined>): string[] {
  return parseBoardList(values.filter(Boolean).join(","));
}

function sanitizeSlug(value: string): string | null {
  const slug = value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return slug || null;
}
