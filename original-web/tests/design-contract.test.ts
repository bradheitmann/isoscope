import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { themes } from "../vendor/desert-pants/build/web/themes";
import { presentedThemes } from "../src/theme-order";
import {
  CANONICAL_MANIFEST_SHA256,
  CANONICAL_SOURCE_COMMIT,
  assertDesignContract,
  canonicalRoleCompletenessFindings,
  missingTokenFindings,
  typographyRoleFindings,
  verifyCanonicalVendor
} from "../enforcement/design-contract";

const root = resolve(import.meta.dirname, "..");
const tokenCss = readFileSync(resolve(root, "vendor/desert-pants/build/web/tokens.css"), "utf8");
const authored = [
  readFileSync(resolve(root, "index.html"), "utf8"),
  readFileSync(resolve(root, "src/original-renderer.ts"), "utf8"),
  readFileSync(resolve(root, "src/main.ts"), "utf8")
].join("\n");
const consumerCss = readFileSync(resolve(root, "src/styles.css"), "utf8");

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
  it("presents the complete canonical theme inventory in exact reverse order", () => {
    expect(presentedThemes).toEqual([...themes].reverse());
    expect(presentedThemes).toHaveLength(18);
    expect(presentedThemes.at(-1)?.id).toBe("desert");
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

  it("pins the vendored source manifest to the approved upstream commit", () => {
    expect(CANONICAL_SOURCE_COMMIT).toBe("ba99de27974f623c20679962e8e3dc4d74c2a273");
    expect(CANONICAL_MANIFEST_SHA256).toBe("3017ea2f8796b54007f4e8a8d3b6516f63241b3e082e6fdcf95568a7ef208bc5");
    expect(() => verifyCanonicalVendor(resolve(root, "vendor/desert-pants"))).not.toThrow();
  });

  it("rejects altered upstream bytes even if the changed asset hash is re-written into the manifest", () => {
    const fixture = mkdtempSync(join(tmpdir(), "isoscope-dp-mutated-"));
    try {
      const sourceVendor = resolve(root, "vendor/desert-pants");
      const copiedVendor = join(fixture, "vendor");
      cpSync(sourceVendor, copiedVendor, { recursive: true });
      const tokenPath = join(copiedVendor, "build/web/tokens.css");
      writeFileSync(tokenPath, readFileSync(tokenPath, "utf8").replace("#fbfaf4", "#000000"));
      const manifestPath = join(copiedVendor, "CANONICAL-MANIFEST.sha256");
      const lines = readFileSync(manifestPath, "utf8").split(/\r?\n/);
      const index = lines.findIndex(line => line.endsWith("  build/web/tokens.css"));
      expect(index).toBeGreaterThanOrEqual(0);
      const changedAssetHash = createHash("sha256").update(readFileSync(tokenPath)).digest("hex");
      lines[index] = `${changedAssetHash}  build/web/tokens.css`;
      writeFileSync(manifestPath, `${lines.join("\n")}`);
      expect(() => verifyCanonicalVendor(copiedVendor)).toThrow(/manifest digest mismatch/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("rejects changed vendored bytes when the pinned manifest is left untouched", () => {
    const fixture = mkdtempSync(join(tmpdir(), "isoscope-dp-byte-drift-"));
    try {
      const copiedVendor = join(fixture, "vendor");
      cpSync(resolve(root, "vendor/desert-pants"), copiedVendor, { recursive: true });
      const tokenPath = join(copiedVendor, "build/web/tokens.css");
      writeFileSync(tokenPath, readFileSync(tokenPath, "utf8").replace("#fbfaf4", "#000000"));
      expect(() => verifyCanonicalVendor(copiedVendor)).toThrow(/asset digest mismatch: build\/web\/tokens\.css/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("rejects a valid token axis borrowed from the wrong complete typography role", () => {
    const wrongButValidRole = `${consumerCss}\n.dp-type-h2 { font-size: var(--dp-type-body-sm-font-size); }`;
    const findings = typographyRoleFindings(tokenCss, wrongButValidRole);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("canonical whole-role recipe requires var(--dp-type-h2-font-size)");
    expect(() => assertDesignContract(tokenCss, wrongButValidRole)).toThrow(/sets font-size/);
  });

  it("requires authored component typography to bind every axis to its exact component recipe", () => {
    const mixedComponentRecipe = `${consumerCss}\n.keyrow { font-size: var(--dp-type-body-sm-font-size); }`;
    expect(typographyRoleFindings(tokenCss, mixedComponentRecipe).some(finding =>
      finding.message.includes("canonical whole-role recipe requires var(--dp-component-scene-label-type-font-size)")
    )).toBe(true);
  });

  it("rejects undefined token variables and incomplete generated typography recipes", () => {
    expect(missingTokenFindings(tokenCss, ".probe { color: var(--dp-color-not-real); }")).toHaveLength(1);
    const roleStart = tokenCss.indexOf(".dp-type-h2 {");
    const roleEnd = tokenCss.indexOf("}", roleStart);
    const roleRule = tokenCss.slice(roleStart, roleEnd + 1);
    const changedRoleRule = roleRule.replace("var(--dp-type-h2-font-size)", "var(--dp-type-body-sm-font-size)");
    const wrongCanonicalRecipe = `${tokenCss.slice(0, roleStart)}${changedRoleRule}${tokenCss.slice(roleEnd + 1)}`;
    expect(canonicalRoleCompletenessFindings(wrongCanonicalRecipe)).toContainEqual(expect.objectContaining({
      message: expect.stringContaining(".dp-type-h2 does not resolve font-size")
    }));
  });
});
