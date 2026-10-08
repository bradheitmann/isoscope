/* Single source of truth for what POST /api/upload accepts. Imported by server/api.ts (allowlist),
   asserted against the accept="" attributes in index.html by tests/upload-policy.test.ts.
   Inert types only: anything a browser could execute or render as markup (html, htm, xhtml, svg,
   xml, js, mjs, cjs, ts, wasm, exe, sh, php, ...) is deliberately absent and is refused with 415. */
export const MEDIA_UPLOAD_EXTENSIONS: readonly string[] = [
  "mp4", "m4v", "webm", "mov", "ogv", "m4a", "mp3", "wav", "ogg", "oga", "flac", "aac",
  "png", "jpg", "jpeg", "gif", "webp", "avif",
];
export const DOCUMENT_UPLOAD_EXTENSIONS: readonly string[] = [
  "csv", "tsv", "txt", "md", "json", "pdf", "zip", "docx", "xlsx", "pptx", "key", "pages",
  "numbers", "rtf", "odt", "ods", "odp",
];
/* ".bin" stays for opaque payloads (served as octet-stream). */
export const UPLOAD_EXTENSION_LIST: readonly string[] = [...MEDIA_UPLOAD_EXTENSIONS, ...DOCUMENT_UPLOAD_EXTENSIONS, "bin"];

const dotted = (l: readonly string[]): string => l.map((e) => "." + e).join(",");
/* accept= strings for the file inputs (face media picker; inside-drawer Add file). */
export const FACE_MEDIA_ACCEPT: string = dotted(MEDIA_UPLOAD_EXTENSIONS);
export const INSIDE_FILE_ACCEPT: string = dotted([...MEDIA_UPLOAD_EXTENSIONS, ...DOCUMENT_UPLOAD_EXTENSIONS]);

export type UploadResult = { src: string; durable: boolean; error?: string };

/* Pure decision for the inside-drawer Add file: persist only a durable src (or any src on a
   static host with no remote store); never save a blob: src while a remote store is active. */
export function insideUploadOutcome(r: UploadResult, remoteActive: boolean): { persist: boolean; message: string } {
  if (r.error) return { persist: false, message: `Upload refused (${r.error}) — not saved.` };
  if (r.durable) return { persist: true, message: "File uploaded + saved." };
  if (remoteActive) return { persist: false, message: "Upload failed — not saved." };
  return { persist: true, message: "Added for this session — export to keep." };
}
