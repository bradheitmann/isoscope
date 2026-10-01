/* Per-module annotation store: notes, an inside drawer of files/notes, and
   per-face surface assignments. Durable + shared through the write-back endpoint
   (examples/annotations.json via the Vite middleware); falls back to localStorage
   when served fully static, with an explicit export to bake in by hand.

   The store is deliberately free of Three.js — pure data + fetch — so it is
   unit-testable and the renderer binds to it, not the reverse. */

export type FaceKey = "roof" | "north" | "south" | "east" | "west";
export const FACES: FaceKey[] = ["roof", "north", "south", "east", "west"];
export type SurfaceKind = "video" | "image" | "mist" | "doc" | "slides" | "ink";
export const SURFACE_KINDS: SurfaceKind[] = ["video", "image", "mist", "doc", "slides", "ink"];

export type SurfaceRef = {
  kind: SurfaceKind;
  src?: string;            /* video/image/slides source (URL or /media/uploads path) */
  text?: string;           /* doc markdown */
  fit?: "cover" | "contain";
  live?: boolean;          /* video: a stream, no loop */
  group?: string;          /* video: surfaces sharing a group play frame-locked (theater) */
  audio?: boolean;         /* video/audio: this surface carries an audible track */
  mistStyle?: string;      /* mist: which wash recipe */
  slides?: string[];       /* slides: ordered image sources */
  ink?: number[][];        /* ink: flattened [x,y,z,...] stroke points, face-local */
};
export type InsideItem = { kind: "file" | "note"; name: string; src?: string; text?: string; addedAt: number };
export type ModuleAnnotation = {
  notes?: string;
  inside?: InsideItem[];
  faces?: Partial<Record<FaceKey, SurfaceRef | null>>;
};
export type AnnotationStore = Record<string, ModuleAnnotation>;

const LS_KEY = "isoscope.annotations";
let cache: AnnotationStore = {};
let remote = true; /* flips false when the endpoint is absent (pure static host) */
const listeners = new Set<() => void>();

export function onAnnotationsChange(fn: () => void): void { listeners.add(fn); }
function emit(): void { listeners.forEach(fn => fn()); }

export function getModule(id: string): ModuleAnnotation {
  return cache[id] ?? {};
}
export function allAnnotations(): AnnotationStore { return cache; }
export function isRemote(): boolean { return remote; }

/* local mirror so a static host still keeps your work between reloads */
function saveLocal(): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch { /* quota/private mode */ }
}
function loadLocal(): AnnotationStore {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as AnnotationStore; } catch { return {}; }
}

export async function loadAnnotations(): Promise<AnnotationStore> {
  try {
    const r = await fetch("api/annotations", { cache: "no-store" });
    if (!r.ok) throw new Error("no endpoint");
    remote = true;
    cache = (await r.json()) as AnnotationStore;
  } catch {
    remote = false;
    cache = loadLocal();
  }
  emit();
  return cache;
}

/* Write one module's record. Remote-first; on a static host the local mirror is
   the store of record and the change is marked for manual export. */
export async function setModule(id: string, rec: ModuleAnnotation): Promise<void> {
  cache = { ...cache, [id]: rec };
  saveLocal();
  emit();
  if (!remote) return;
  try {
    const r = await fetch(`api/annotations/${encodeURIComponent(id)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rec),
    });
    if (!r.ok) throw new Error("write failed");
  } catch {
    remote = false; /* endpoint vanished mid-session; keep working locally */
  }
}

export async function clearModule(id: string): Promise<void> {
  const next = { ...cache }; delete next[id]; cache = next;
  saveLocal(); emit();
  if (!remote) { return; }
  try { await fetch(`api/annotations/${encodeURIComponent(id)}`, { method: "DELETE" }); } catch { remote = false; }
}

/* Convenience mutators — read-modify-write the one module's record. */
export async function setNotes(id: string, notes: string): Promise<void> {
  await setModule(id, { ...getModule(id), notes });
}
export async function setFace(id: string, face: FaceKey, ref: SurfaceRef | null): Promise<void> {
  const cur = getModule(id);
  await setModule(id, { ...cur, faces: { ...cur.faces, [face]: ref } });
}
export async function addInside(id: string, item: InsideItem): Promise<void> {
  const cur = getModule(id);
  await setModule(id, { ...cur, inside: [...(cur.inside ?? []), item] });
}
export async function removeInside(id: string, index: number): Promise<void> {
  const cur = getModule(id);
  const inside = (cur.inside ?? []).filter((_, i) => i !== index);
  await setModule(id, { ...cur, inside });
}

/* Upload a binary to the served media dir; returns the same-origin src. On a
   static host, falls back to an object URL that lives only for the session and
   is flagged so the UI can say "export to keep". */
export async function uploadFile(file: File): Promise<{ src: string; durable: boolean }> {
  if (remote) {
    try {
      const r = await fetch(`api/upload?name=${encodeURIComponent(file.name)}`, {
        method: "POST", headers: { "content-type": "application/octet-stream" }, body: file,
      });
      if (r.ok) { const j = (await r.json()) as { src?: string }; if (j.src) return { src: j.src, durable: true }; }
    } catch { remote = false; }
  }
  return { src: URL.createObjectURL(file), durable: false };
}

/* Bake the whole store to a downloadable JSON for manual commit on static hosts. */
export function exportAnnotations(): void {
  const blob = new Blob([JSON.stringify({ $schema: "per-module annotations", modules: cache }, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "annotations.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
