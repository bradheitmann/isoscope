import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sourceUrl = (path: string): URL => new URL(path, import.meta.url);
const read = (path: string): string => readFileSync(sourceUrl(path), "utf8");
const css = read("../src/app.css");
const generated = read("../../../vendor/desert-pants/build/web/tokens.css") + read("../../../vendor/desert-pants/build/web/themes.css");
const known = new Set(Array.from(generated.matchAll(/(--dp-[a-z0-9-]+)\s*:/g), (match) => match[1]));

function violations(source: string): string[] {
  const errors: string[] = [];
  for (const match of source.matchAll(/var\((--dp-[a-z0-9-]+)/g)) {
    if (!known.has(match[1])) errors.push(`Unknown token ${match[1]}`);
  }
  if (/(?:#[a-f0-9]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|color-mix)\()/i.test(source)) errors.push("Raw color");
  if (/font-family\s*:\s*["']|font-size\s*:\s*\d|font\s*:\s*var\(|\b\d+(?:\.\d+)?ms\b/.test(source)) errors.push("Raw type or motion");
  for (const match of source.matchAll(/(?:^|[;{])\s*(?:padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|gap|row-gap|column-gap)\s*:\s*([^;}]+)/g)) {
    if (/\d+(?:\.\d+)?px\b/.test(match[1] ?? "")) errors.push("Raw spacing");
  }
  if (/(?:^|[;{])\s*(?:left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/.test(source)) errors.push("Physical direction");
  if (/var\(--dp-[a-z0-9-]+\s*,/.test(source)) errors.push("Token fallback");
  if (/(?:z-index|opacity|font-weight|text-transform)\s*:\s*(?:[2-9]|\.[0-9]|uppercase|capitalize)/.test(source)) errors.push("Raw semantic value");
  return errors;
}

describe("canonical Desert Pants design contract", () => {
  it("uses only existing aliases and approved token derivations", () => {
    expect(violations(css)).toEqual([]);
    for (const family of ["component", "type", "space", "layout", "motion", "effect", "gradient"]) {
      expect(css).toContain(`var(--dp-${family}-`);
    }
  });

  it("detects bad aliases and representative raw styling drift", () => {
    expect(violations("a { color: var(--dp-color-bg-subtle, red); }")).toContain("Unknown token --dp-color-bg-subtle");
    expect(violations(css.replace("var(--dp-color-text-primary)", "#123456"))).toContain("Raw color");
    expect(violations("a { font-size: 12px; padding: 8px; transition: color 120ms; }")).toEqual(["Raw type or motion", "Raw spacing"]);
    expect(violations("a { margin-left: var(--dp-space-2); }")).toContain("Physical direction");
    expect(violations("a { color: var(--dp-color-text-primary, red); }")).toContain("Token fallback");
    expect(violations("a { opacity: .7; }")).toContain("Raw semantic value");
  });

  it("pins the actual generated manifest and token outputs", () => {
    const hashes: Record<string, string> = {
      "build/web/tokens.css": "c8afb77d48ffe8b3c4320e26b2f891f22bfcd447479ec22f16b14df64d175c0b",
      "build/web/tokens.json": "8e8065dc2e49f0a042dc92e9ae056808dcf06f0dcf61695a36f542d490cd3486",
      "build/web/themes.json": "c1b8dd42242ba3bec02732f99be565fd01951357f07877de90165386d75bb7d2",
      "build/web/themes.css": "695329e99390b175fc70a3e1a821479d59a8b1370160225f1c79b1c2ea9d35ab",
      "build/web/themes.ts": "05692ec25dbac371b036d7a30f4c5074eac08a21838e898d715a9719acf40bd2",
      "build/web/fonts.css": "ae6a4ef11f05df46fea370443b6c9f5d4b453e68909386c41f61c38217a10cab",
      "fonts/InclusiveSans-Italic-Variable.ttf": "1b94e7bc731a3d91e358bff9f9253ccef36012e214c0ba64661741fa44494b2e",
      "fonts/InclusiveSans-Italic-Variable.woff2": "d77489c222ae5cff975792f3fa8493c6500bcde47f21b0aee6735ee7ac3c0838",
      "fonts/InclusiveSans-Variable.ttf": "52ae5fdb8eda45633f1e9817ebdb07d8075c89081d51204f16f78394608a5c4e",
      "fonts/InclusiveSans-Variable.woff2": "0dfc21542eb78c3b5560f95b4ef6d1bf0aabad150ad91ab4dd32b8a7998a73c1",
      "fonts/JetBrainsMono-Italic-Variable.ttf": "85ae2a5cd3f56baf1ce1c21a851322c58e3d8fbe8e8ad4a4d090a820dd7fe558",
      "fonts/JetBrainsMono-Italic-Variable.woff2": "6e1c7812880347933bc76e120723cd4a817b00fae484c98baab183ce11278181",
      "fonts/JetBrainsMono-Variable.ttf": "48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda",
      "fonts/JetBrainsMono-Variable.woff2": "7a0c045b7e00b4a3e7a50e4f9d71d440776e29c2375c14141b7525d05678c2ef",
      "fonts/NotoSansArabic-Variable.ttf": "687ac90c365914cd54935bf744dcaf21c477f707ab55137ada2b17d5031e9953",
      "fonts/NotoSansArabic-Variable.woff2": "12510b2dd19f92c41df92505e67da9df936462967331dd3166b4afe1001c43b8",
      "fonts/NotoSansHebrew-Variable.ttf": "0cbfbf39e94dd2bc0b88cd990efba4911a8387987202c1ba6317e366a58f6939",
      "fonts/NotoSansHebrew-Variable.woff2": "d547f87c3706974b3159529a76e992a724b3bc1d7153cadc71fd1951d84e2d03",
      "fonts/OFL-InclusiveSans.txt": "0690e0819628a20c5ee68388a7bae621e5c3e53be57276169decd00111d8f2cf",
      "fonts/OFL-JetBrainsMono.txt": "b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d",
      "fonts/OFL-NotoSansArabic.txt": "91053c23e8a0fe5fc9b5fdbe5ff74ceffd66f6f996c123f1a6ca4c23487c1fff",
      "fonts/OFL-NotoSansHebrew.txt": "7387750a626d005e86adc8b9321567f001fc2f6ef5c8f275261c454fe86981d4",
    };
    const vendor = sourceUrl("../../../vendor/desert-pants/");
    for (const [file, digest] of Object.entries(hashes)) {
      expect(createHash("sha256").update(readFileSync(new URL(file, vendor))).digest("hex")).toBe(digest);
    }
    const commit = "74777b54301ebfa8c63649adb559a1256160f6fa";
    const manifest = `source_commit=${commit}\n` + Object.entries(hashes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, digest]) => `${digest}  ${file}\n`).join("");
    expect(createHash("sha256").update(manifest).digest("hex")).toBe("8fa611afbf3cc189677cdf502d09e0b308a019b4e65319ae94ee355f82df140d");
    expect(read("../../../vendor/desert-pants/UPSTREAM.md")).toContain(commit);
    expect(createHash("sha256").update(readFileSync(new URL("UPSTREAM.md", vendor))).digest("hex")).toBe("2080b38554fc946477abcbd264f740fd4c9e1e31b7d0535d21a0d33d7c05434c");
    const actual = readdirSync(vendor, { recursive: true }).filter((path): path is string => typeof path === "string").filter((path) => statSync(new URL(path, vendor)).isFile()).sort();
    expect(actual).toEqual([...Object.keys(hashes), "UPSTREAM.md"].sort());
  });

  it("keeps keyboard focus, touch sizing and motion preference changes visible", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("var(--dp-component-button-focus-ring-default)");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("var(--dp-layout-size-touch-min)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none !important");
    expect(css).toContain("transition: none !important");
    expect(css).not.toMatch(/\.topology-canvas__surface\s*\{[^}]*outline:\s*none/);
  });
});
