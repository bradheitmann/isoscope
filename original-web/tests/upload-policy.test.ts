import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FACE_MEDIA_ACCEPT, INSIDE_FILE_ACCEPT, UPLOAD_EXTENSION_LIST, insideUploadOutcome,
} from "../src/upload-policy";
import { UPLOAD_EXTENSIONS } from "../server/api";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const acceptOf = (id: string): string => {
  const m = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html);
  expect(m, id).not.toBeNull();
  const a = /accept="([^"]*)"/.exec(m![0]);
  expect(a, `${id} has an accept attribute`).not.toBeNull();
  return a![1]!;
};

describe("upload policy: accept attributes agree with the server allowlist", () => {
  it("server allowlist is generated from the shared list", () => {
    expect([...UPLOAD_EXTENSIONS].sort()).toEqual([...UPLOAD_EXTENSION_LIST].sort());
  });
  it("every file input that posts to /api/upload has an accept list that is a subset of the allowlist", () => {
    const inputs = [...html.matchAll(/<input[^>]*type="file"[^>]*>/g)].map((m) => m[0]);
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    for (const tag of inputs) {
      const a = /accept="([^"]*)"/.exec(tag);
      expect(a, tag).not.toBeNull();
      for (const tok of a![1]!.split(",")) {
        expect(tok.startsWith("."), `${tok} must be an explicit extension`).toBe(true);
        expect(UPLOAD_EXTENSIONS.has(tok.slice(1)), `${tok} is in the server allowlist`).toBe(true);
      }
    }
  });
  it("index.html accept attributes equal the exported strings", () => {
    expect(acceptOf("insideFileIn")).toBe(INSIDE_FILE_ACCEPT);
    expect(acceptOf("faceFileIn")).toBe(FACE_MEDIA_ACCEPT);
  });
  it("document types are offered by the inside drawer, active types never are", () => {
    const toks = INSIDE_FILE_ACCEPT.split(",");
    for (const e of [".docx", ".csv", ".zip", ".xlsx", ".pdf"]) expect(toks).toContain(e);
    for (const e of [".html", ".svg", ".js", ".xml", ".exe", ".sh"]) expect(toks).not.toContain(e);
  });
});

describe("inside drawer upload decision", () => {
  it("a refusal never persists and shows the reason", () => {
    const o = insideUploadOutcome({ src: "", durable: false, error: "415 unsupported upload type" }, true);
    expect(o.persist).toBe(false);
    expect(o.message).toContain("415 unsupported upload type");
    expect(o.message).not.toMatch(/uploaded \+ saved/i);
  });
  it("a non-durable result with a remote store is not persisted", () => {
    const o = insideUploadOutcome({ src: "blob:x", durable: false }, true);
    expect(o.persist).toBe(false);
    expect(o.message).not.toMatch(/uploaded \+ saved/i);
  });
  it("a durable result persists and says saved", () => {
    expect(insideUploadOutcome({ src: "/media/uploads/a.docx", durable: true }, true)).toEqual({ persist: true, message: "File uploaded + saved." });
  });
  it("static host (no remote) keeps the session-only behavior", () => {
    const o = insideUploadOutcome({ src: "blob:x", durable: false }, false);
    expect(o.persist).toBe(true);
    expect(o.message).toMatch(/export to keep/);
  });
});
