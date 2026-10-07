import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { themes } from "../vendor/desert-pants/build/web/themes";
import { presentedThemes } from "../src/theme-order";

const root = resolve(import.meta.dirname, "..");
const tokenCss = readFileSync(resolve(root, "vendor/desert-pants/build/web/tokens.css"), "utf8");
const authored = [
  readFileSync(resolve(root, "index.html"), "utf8"),
  readFileSync(resolve(root, "src/original-renderer.ts"), "utf8"),
  readFileSync(resolve(root, "src/main.ts"), "utf8")
].join("\n");

function referencedTypographyRoles(source: string): Set<string> {
  return new Set(source.match(/\bdp-type-[a-z0-9-]+\b/g) ?? []);
}

function canonicalTypographyRoles(css: string): Set<string> {
  return new Set(css.match(/\.dp-type-[a-z0-9-]+(?=[\s,{:.#[])/g) ?? []);
}

function unknownTypographyRoles(source: string, css: string): string[] {
  const valid = canonicalTypographyRoles(css);
  return [...referencedTypographyRoles(source)].filter(role => !valid.has(`.${role}`)).sort();
}

describe("canonical Desert Pants design contract", () => {
  it("presents the complete canonical theme inventory, curated for the map", () => {
    /* Completeness is the contract: every canonical theme is offered exactly once.
       Order is a product decision (readable, characterful palettes lead); the
       inventory itself must stay complete and deduplicated. */
    expect(presentedThemes).toHaveLength(themes.length);
    expect(new Set(presentedThemes.map(t => t.id)).size).toBe(themes.length);
    expect([...presentedThemes].map(t => t.id).sort()).toEqual([...themes].map(t => t.id).sort());
    /* the curated lead set must actually lead, and desert (the base) stays present */
    expect(presentedThemes[0]?.id).toBe("dracula");
    expect(presentedThemes.some(t => t.id === "desert")).toBe(true);
  });

  it("rejects every UI typography role absent from generated canonical CSS", () => {
    expect(unknownTypographyRoles(authored, tokenCss)).toEqual([]);
  });

  it("negative control catches a plausible but nonexistent role alias", () => {
    const mutated = `${authored}\n<p class="dp-type-title">Wrong role</p>`;
    expect(unknownTypographyRoles(mutated, tokenCss)).toContain("dp-type-title");
  });

  it("binds the Isoscope brand and reading heading to actual generated roles", () => {
    expect(tokenCss).toContain(".dp-type-brand-name");
    expect(tokenCss).toContain(".dp-type-h2");
    expect(authored).toContain('id="brandV" class="dp-type-brand-name dp-wordmark"');
    expect(authored).toContain('<h1 class="dp-type-h2" id="pTitle">');
  });
});
