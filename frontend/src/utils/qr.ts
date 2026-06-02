/** Normalizes scanned or pasted QR payload to token, short code, or URL tail. */
export function normalizeQrValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const marker = "/qr/";
    const idx = url.pathname.indexOf(marker);
    if (idx >= 0) {
      const token = url.pathname.slice(idx + marker.length).replace(/\/$/, "");
      return decodeURIComponent(token.split("/")[0] ?? token);
    }
  } catch {
    // Not an absolute URL — try relative paths below.
  }

  const marker = "/qr/";
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) {
    const tail = trimmed.slice(idx + marker.length);
    const token = tail.split(/[?#]/)[0]?.split("/")[0] ?? tail;
    return decodeURIComponent(token);
  }

  if (trimmed.startsWith("customer:")) {
    return trimmed.slice("customer:".length);
  }

  return trimmed;
}

export function isQrTokenLike(value: string): boolean {
  return value.includes(".") || value.includes("/qr/") || value.startsWith("customer:");
}
