/* Spec-provided media sources are untrusted input. These helpers allow only
   same-origin relative paths, http(s) and blob: URLs; images also allow a fixed
   set of data:image types. Anything else is rejected (null) so callers degrade
   exactly as for a missing source. */
const BASE = "https://isoscope.invalid/";
const IMAGE_DATA = /^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/i;
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\\]/;

export function safeMediaSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const src = raw.trim();
  if (!src || CONTROL_OR_BACKSLASH.test(src) || src.startsWith("//")) return null;
  let url: URL;
  try { url = new URL(src, BASE); } catch { return null; }
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(src);
  if (!hasScheme) return url.origin === new URL(BASE).origin ? src : null;
  return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:" ? src : null;
}

export function safeImageSrc(raw: unknown): string | null {
  const ok = safeMediaSrc(raw);
  if (ok) return ok;
  if (typeof raw !== "string") return null;
  const src = raw.trim();
  return IMAGE_DATA.test(src) ? src : null;
}

const warned = new Set<string>();
/** Validate a spec src for a node; a rejection logs one console.warn per node+src. */
export function vetSrc(raw: unknown, nodeId: string, image = false): string | null {
  const out = image ? safeImageSrc(raw) : safeMediaSrc(raw);
  if (out === null && raw) {
    const key = nodeId + "\0" + String(raw);
    if (!warned.has(key) && warned.size < 256) { warned.add(key); console.warn(`[isoscope] rejected unsafe media src on node ${nodeId}`); }
  }
  return out;
}
