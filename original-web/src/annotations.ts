/* Per-module annotation store: notes, an inside drawer of files/notes, and
   per-face surface assignments. Durable through the write-back endpoint
   (gitignored examples/annotations.local.json via the Vite middleware; the tracked
   examples/annotations.json is only a read-only seed); falls back to localStorage
   when served fully static, with an explicit export to bake in by hand.

   The store is deliberately free of Three.js — pure data + fetch — so it is
   unit-testable and the renderer binds to it, not the reverse. */

import { emitWide } from "./telemetry";
import type { UploadResult } from "./upload-policy";

export type FaceKey = "roof" | "north" | "south" | "east" | "west" | "bottom";
export const FACES: FaceKey[] = ["roof", "north", "south", "east", "west", "bottom"];
export type SurfaceKind = "video" | "image" | "doc" | "slides" | "ink";
export const SURFACE_KINDS: SurfaceKind[] = ["video", "image", "doc", "slides", "ink"];

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

async function doLoad(): Promise<AnnotationStore> {
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

/* Hydration barrier (F01): every read-modify-write awaits the initial load, so a
   first edit can never replace unseen server fields (faces/inside) with a
   partial record built from an empty cache. An explicit loadAnnotations seals
   the barrier, so tests/boot paths that load directly are not double-counted. */
let hydrating: Promise<AnnotationStore> | null = null;
export function loadAnnotations(): Promise<AnnotationStore> {
  hydrating = doLoad().catch(() => cache);
  return hydrating;
}
export function ensureHydrated(): Promise<AnnotationStore> {
  if (!hydrating) hydrating = doLoad().catch(() => cache);
  return hydrating;
}

/* Per-module write serialization (F03): each write POSTs the CURRENT cache
   record when it runs, so rapid edits coalesce and an older body can never
   arrive last. DELETEs chain on the same per-module queue. */
const writeQueue = new Map<string, Promise<void>>();
function enqueue(id: string, op: () => Promise<void>): Promise<void> {
  const next = (writeQueue.get(id) ?? Promise.resolve()).then(op, op);
  writeQueue.set(id, next.catch(() => { /* keep the queue alive after a failure */ }));
  return next;
}

/* Write one module's record. Remote-first; on a static host the local mirror is
   the store of record and the change is marked for manual export. */
export async function setModule(id: string, rec: ModuleAnnotation): Promise<void> {
  await ensureHydrated();
  cache = { ...cache, [id]: rec };
  saveLocal();
  emit();
  if (!remote) return;
  /* a record write crosses the web→serve seam (SV persists to the store). Trace it
     as a wide event so that edge's health reflects real flow, live. */
  return enqueue(id, async () => {
    const current = cache[id];
    if (current === undefined) return; /* cleared while queued */
    const t0 = performance.now();
    try {
      const r = await fetch(`api/annotations/${encodeURIComponent(id)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(current),
      });
      if (!r.ok) throw new Error("write failed");
      emitWide({ edge: "DB-SV", from: "SV", to: "DB", name: "annotation.save", durationMs: performance.now() - t0, ok: true, kind: "CLIENT" });
    } catch (e) {
      remote = false; /* endpoint vanished mid-session; keep working locally */
      emitWide({ edge: "DB-SV", from: "SV", to: "DB", name: "annotation.save", durationMs: performance.now() - t0, ok: false, kind: "CLIENT", error: e instanceof Error ? e.message : "write failed" });
    }
  });
}

export async function clearModule(id: string): Promise<void> {
  await ensureHydrated();
  const next = { ...cache }; delete next[id]; cache = next;
  saveLocal(); emit();
  if (!remote) { return; }
  return enqueue(id, async () => {
    try { await fetch(`api/annotations/${encodeURIComponent(id)}`, { method: "DELETE" }); } catch { remote = false; }
  });
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
export async function uploadFile(file: File): Promise<UploadResult> {
  if (remote) {
    try {
      const r = await fetch(`api/upload?name=${encodeURIComponent(file.name)}`, {
        method: "POST", headers: { "content-type": "application/octet-stream" }, body: file,
      });
      if (r.ok) {
        const j = (await r.json()) as { src?: string };
        if (j.src) return { src: j.src, durable: true };
        return { src: "", durable: false, error: `${r.status} malformed upload response` };
      }
      /* The server refused: surface the reason; never hand back a blob: URL that looks saved. */
      let msg = r.statusText || "refused";
      try { const j = (await r.json()) as { error?: string; message?: string }; msg = j.error ?? j.message ?? msg; } catch { /* non-JSON body */ }
      return { src: "", durable: false, error: `${r.status} ${msg}` };
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
