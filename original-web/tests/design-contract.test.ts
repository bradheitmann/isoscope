import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
  domRoleFindings,
  missingTokenFindings,
  typographyRoleFindings,
  verifyCanonicalVendor
} from "../enforcement/design-contract";

const root = resolve(import.meta.dirname, "..");
const indexHtml = readFileSync(resolve(root, "index.html"), "utf8");
const tokenCss = readFileSync(resolve(root, "vendor/desert-pants/build/web/tokens.css"), "utf8");
const authored = [
  indexHtml,
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

function createEnforcementScratch(): string {
  const scratchRoot = mkdtempSync(join(tmpdir(), "isoscope-import-phase-"));
  mkdirSync(join(scratchRoot, "vendor"), { recursive: true });
  cpSync(resolve(root, "vendor/desert-pants"), join(scratchRoot, "vendor/desert-pants"), { recursive: true });
  cpSync(resolve(root, "enforcement"), join(scratchRoot, "enforcement"), { recursive: true });
  mkdirSync(join(scratchRoot, "src"), { recursive: true });
  symlinkSync(resolve(root, "node_modules"), join(scratchRoot, "node_modules"), "dir");
  writeFileSync(join(scratchRoot, "package.json"), readFileSync(resolve(root, "package.json")));
  writeFileSync(join(scratchRoot, "index.html"), indexHtml);
  return scratchRoot;
}

function runScratchEnforcement(scratchRoot: string, css: string): number | null {
  writeFileSync(join(scratchRoot, "src/styles.css"), css);
  const result = spawnSync("npm", ["run", "enforce"], { cwd: scratchRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  return result.status;
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
    expect(CANONICAL_MANIFEST_SHA256).toBe("1d92f2e00d8934bd240f6918f16d4e9c49b6172f0b42925443fc1d5887e4d3db");
    expect(() => verifyCanonicalVendor(resolve(root, "vendor/desert-pants"))).not.toThrow();
    const layoutTokens = readFileSync(resolve(root, "vendor/desert-pants/tokens/04-layout.tokens.json"));
    expect(createHash("sha256").update(layoutTokens).digest("hex")).toBe("2225319649c5f32d8800c9b610652d5eab7d237f12f14bc903ded3f7667991ee");
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
    expect(() => assertDesignContract(tokenCss, wrongButValidRole, indexHtml)).toThrow(/sets font-size/);
  });

  it("honors declaration order for normal typography but rejects unsupported priority overrides", () => {
    const wrongThenCanonical = `${consumerCss}\n.dp-type-h2 { font-size: var(--dp-type-body-sm-font-size); font-size: var(--dp-type-h2-font-size); }`;
    expect(() => assertDesignContract(tokenCss, wrongThenCanonical, indexHtml)).not.toThrow();

    const importantWrongThenCanonical = `${consumerCss}\n.dp-type-h2 { font-size: var(--dp-type-body-sm-font-size) !important; font-size: var(--dp-type-h2-font-size); }`;
    expect(() => assertDesignContract(tokenCss, importantWrongThenCanonical, indexHtml)).toThrow(/unsupported !important typography priority/);
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

  it("rejects escaped CSS property spellings instead of silently ignoring the typography declaration", () => {
    const escaped = `${consumerCss}\n.dp-type-h2 { f\\6f nt-size: var(--dp-type-body-sm-font-size); }`;
    expect(() => assertDesignContract(tokenCss, escaped, indexHtml)).toThrow(/CSS escape sequences are unsupported/);
  });

  it("rejects role-token substitution and reset properties in media and global rules", () => {
    const roleVariableOverride = `${consumerCss}\n@media (max-width: 1180px) { #pTitle { --dp-type-h2-letter-spacing: var(--dp-type-body-sm-letter-spacing); } }`;
    expect(() => assertDesignContract(tokenCss, roleVariableOverride, indexHtml)).toThrow(/redefines reserved canonical token/);
    const reset = `${consumerCss}\n/* dp-art: canvas */ * { all: initial; }`;
    expect(() => assertDesignContract(tokenCss, reset, indexHtml)).toThrow(/forbidden CSS reset property all/);
  });

  it("rejects role declarations unless every selector is a direct single-role subject", () => {
    const bypasses = [
      `.dp-type-body-sm, #pTitle { font-size: var(--dp-type-body-sm-font-size); }`,
      `#pTitle:not(.dp-type-body-sm) { font-size: var(--dp-type-body-sm-font-size); }`,
      `.dp-type-body-sm, #pTitle { font-family: var(--dp-type-body-sm-font-family); font-size: var(--dp-type-body-sm-font-size); font-weight: var(--dp-type-body-sm-font-weight); line-height: var(--dp-type-body-sm-line-height); letter-spacing: var(--dp-type-body-sm-letter-spacing); text-transform: var(--dp-type-body-sm-text-transform); font-variant-numeric: var(--dp-type-body-sm-font-variant-numeric); }`,
      `@media (max-width: 1180px) { .dp-type-body-sm, #pTitle { font-variant-numeric: var(--dp-type-body-sm-font-variant-numeric); } }`
    ];
    for (const selector of bypasses) {
      expect(() => assertDesignContract(tokenCss, `${consumerCss}\n${selector}`, indexHtml)).toThrow(/direct single-role selector subject/);
    }
    expect(() => assertDesignContract(tokenCss, `${consumerCss}\n.dp-type-h2 { font-size: var(--dp-type-h2-font-size); }`, indexHtml)).not.toThrow();
  });

  it("rejects case-insensitive CSS var functions with missing case-sensitive token names", () => {
    for (const functionName of ["VAR", "Var", "vAr"]) {
      expect(missingTokenFindings(tokenCss, `.probe { color: ${functionName}(--dp-color-not-real); }`)).toHaveLength(1);
      expect(missingTokenFindings(tokenCss, `.probe { color: ${functionName}(--dp-color-bg-canvas); }`)).toHaveLength(0);
    }
  });

  it("rejects nonterminal slash attributes and conflicting intended DOM type roles", () => {
    const slash = `${indexHtml}\n<p / style="font-size:12px" data-dp-art="canvas">Non-art UI</p>`;
    expect(() => domRoleFindings(tokenCss, slash)).toThrow(/unexpected-solidus-in-tag/);
    const extraRole = indexHtml.replace('class="dp-type-h3" id="moduleNavigatorTitle"', 'class="dp-type-h3 dp-type-body-sm" id="moduleNavigatorTitle"');
    expect(domRoleFindings(tokenCss, extraRole).some(finding => finding.message.includes("conflicting typography roles"))).toBe(true);
  });

  it("binds wide and compact workbench tracks to the canonical workbench recipe", () => {
    expect(() => assertDesignContract(tokenCss, `${consumerCss}\n.workbench { grid-template-columns: 1px 1px 1px; gap: 0; }`, indexHtml)).toThrow(/wide workbench grid/);
    expect(() => assertDesignContract(tokenCss, `${consumerCss}\n.shell .workbench { grid-template-columns: 1px; }`, indexHtml)).toThrow(/grid\/gap declaration inventory/);
    expect(() => assertDesignContract(tokenCss, `${consumerCss}\n@media (max-width: 1180px) { .workbench { grid-template-columns: 1px 1px; gap: 0; } }`, indexHtml)).toThrow(/compact workbench grid/);
    const wrongBreakpoint = consumerCss.replace("@media (max-width: 1180px)", "@media (max-width: 1179px)");
    expect(() => assertDesignContract(tokenCss, wrongBreakpoint, indexHtml)).toThrow(/compact workbench grid/);
    expect(() => assertDesignContract(tokenCss, consumerCss, indexHtml)).not.toThrow();
  });

  it("rejects grid reset shorthands and gap subproperties across every selector and context", () => {
    const workbenchGap = "gap: var(--dp-layout-grid-component-visualization-workbench-gap);";
    const workbenchPrefix = `.workbench { display: grid; grid-template-columns: var(--dp-layout-grid-component-visualization-workbench-rail-width) minmax(0, 1fr) minmax(var(--dp-layout-grid-component-visualization-workbench-reading-min-width), var(--dp-layout-grid-component-visualization-workbench-reading-preferred-width)); ${workbenchGap}`;
    const wideReset = consumerCss.replace(workbenchPrefix, `${workbenchPrefix} grid: none;`);
    const wideTemplateReset = consumerCss.replace(workbenchPrefix, `${workbenchPrefix} grid-template: none;`);
    const wideGapOverride = consumerCss.replace(workbenchPrefix, `${workbenchPrefix} column-gap: 0;`);
    const broadOverrides = [
      `* { grid-template-columns: 1px 1px 1px !important; gap: 0 !important; }`,
      `[id] { grid-template-columns: 1px !important; column-gap: 0 !important; }`,
      `@media (max-width: 1180px) { [class] { grid-template-columns: 1px !important; gap: 0 !important; } }`
    ];
    for (const mutated of [wideReset, wideTemplateReset, wideGapOverride, ...broadOverrides.map(rule => `${consumerCss}\n${rule}`)]) {
      expect(() => assertDesignContract(tokenCss, mutated, indexHtml)).toThrow(/grid\/gap declaration inventory/);
    }
    expect(() => assertDesignContract(tokenCss, consumerCss, indexHtml)).not.toThrow();
  });

  it("preserves normal declaration order for layout and rejects important layout resets", () => {
    const workbenchPrefix = ".workbench { display: grid; grid-template-columns: var(--dp-layout-grid-component-visualization-workbench-rail-width) minmax(0, 1fr) minmax(var(--dp-layout-grid-component-visualization-workbench-reading-min-width), var(--dp-layout-grid-component-visualization-workbench-reading-preferred-width)); gap: var(--dp-layout-grid-component-visualization-workbench-gap);";
    const canonicalColumns = "grid-template-columns: var(--dp-layout-grid-component-visualization-workbench-rail-width) minmax(0, 1fr) minmax(var(--dp-layout-grid-component-visualization-workbench-reading-min-width), var(--dp-layout-grid-component-visualization-workbench-reading-preferred-width));";
    const normalWrongThenCanonical = consumerCss.replace(workbenchPrefix, `${workbenchPrefix} grid-template-columns: 1px 1px 1px; ${canonicalColumns}`);
    expect(normalWrongThenCanonical).not.toBe(consumerCss);
    expect(() => assertDesignContract(tokenCss, normalWrongThenCanonical, indexHtml)).not.toThrow();

    const importantColumns = consumerCss.replace(workbenchPrefix, `${workbenchPrefix} grid-template-columns: 1px 1px 1px !important; ${canonicalColumns}`);
    const importantGap = consumerCss.replace(workbenchPrefix, `${workbenchPrefix} gap: 0 !important; gap: var(--dp-layout-grid-component-visualization-workbench-gap);`);
    expect(() => assertDesignContract(tokenCss, importantColumns, indexHtml)).toThrow(/unsupported !important layout priority/);
    expect(() => assertDesignContract(tokenCss, importantGap, indexHtml)).toThrow(/unsupported !important layout priority/);
  });

  it("recognizes priority from the parsed CSS token structure across declaration forms and nesting", () => {
    const prioritySpellings = [
      "! important",
      "!\tIMPORTANT",
      "!\nimportant",
      "!/**/ important",
      "!/**/important",
      "!/**/\nIMPORTANT"
    ];
    const widePrefix = ".workbench { display: grid; grid-template-columns: var(--dp-layout-grid-component-visualization-workbench-rail-width) minmax(0, 1fr) minmax(var(--dp-layout-grid-component-visualization-workbench-reading-min-width), var(--dp-layout-grid-component-visualization-workbench-reading-preferred-width)); gap: var(--dp-layout-grid-component-visualization-workbench-gap);";
    const compactPrefix = ".workbench { grid-template-columns: var(--dp-layout-grid-component-visualization-workbench-rail-width) minmax(0, 1fr); gap: var(--dp-layout-grid-component-visualization-workbench-compact-gap);";
    const canonicalWideColumns = "grid-template-columns: var(--dp-layout-grid-component-visualization-workbench-rail-width) minmax(0, 1fr) minmax(var(--dp-layout-grid-component-visualization-workbench-reading-min-width), var(--dp-layout-grid-component-visualization-workbench-reading-preferred-width));";
    const canonicalCompactColumns = "grid-template-columns: var(--dp-layout-grid-component-visualization-workbench-rail-width) minmax(0, 1fr);";

    for (const priority of prioritySpellings) {
      const typeAttack = `${consumerCss}\n.dp-type-h2 { font-size: var(--dp-type-body-sm-font-size) ${priority}; font-size: var(--dp-type-h2-font-size); }`;
      const wideAttack = consumerCss.replace(widePrefix, `${widePrefix} grid-template-columns: 1px 1px 1px ${priority}; ${canonicalWideColumns}`);
      const compactAttack = consumerCss.replace(compactPrefix, `${compactPrefix} grid-template-columns: 1px 1px ${priority}; ${canonicalCompactColumns}`);
      const nestedAttack = `${consumerCss}\n@media (max-width: 1180px) { @media (min-width: 600px) { .dp-type-h2 { font-size: var(--dp-type-body-sm-font-size) ${priority}; font-size: var(--dp-type-h2-font-size); } } }`;

      expect(() => assertDesignContract(tokenCss, typeAttack, indexHtml)).toThrow(/unsupported !important typography priority/);
      expect(() => assertDesignContract(tokenCss, wideAttack, indexHtml)).toThrow(/unsupported !important layout priority/);
      expect(() => assertDesignContract(tokenCss, compactAttack, indexHtml)).toThrow(/unsupported !important layout priority/);
      expect(() => assertDesignContract(tokenCss, nestedAttack, indexHtml)).toThrow(/unsupported !important typography priority/);
    }

    const ordinaryCascadePositive = `${consumerCss}\n.dp-type-h2 { font-size: var(--dp-type-body-sm-font-size); font-size: var(--dp-type-h2-font-size); }`;
    expect(() => assertDesignContract(tokenCss, ordinaryCascadePositive, indexHtml)).not.toThrow();
  });

  it("accepts only the complete canonical root import phase before stylesheet rules and media", () => {
    const importLines = consumerCss.match(/^@import [^\n]+;$/gm) ?? [];
    expect(importLines).toHaveLength(5);
    const importBlock = `${importLines.join("\n")}\n`;
    const body = consumerCss.replace(importBlock, "");
    expect(body).not.toBe(consumerCss);
    const reordered = [importLines[1], importLines[0], ...importLines.slice(2)].join("\n") + `\n${body}`;
    const duplicate = `${importBlock}${importLines[0]}\n${body}`;
    const late = `${body}\n${importBlock}`;
    const ruleBeforeImports = `.probe { color: red; }\n${importBlock}${body}`;
    const ruleBetweenImports = `${importLines[0]}\n.probe { color: red; }\n${importLines.slice(1).join("\n")}\n${body}`;
    const mediaBeforeImports = `@media (min-width: 1px) { .probe { color: red; } }\n${importBlock}${body}`;
    const mediaAfterFirstImport = `${importLines[0]}\n@media (min-width: 1px) { .probe { color: red; } }\n${importLines.slice(1).join("\n")}\n${body}`;
    const nestedImport = `@media (min-width: 1px) { ${importLines[0]} }\n${importLines.slice(1).join("\n")}\n${body}`;
    const extraImport = `${importBlock}@import "../vendor/desert-pants/extra.css";\n${body}`;
    const zeroImports = body;
    const unsupportedContext = `@layer theme { ${importBlock} }\n${body}`;
    const invalidCases = [
      ["zero imports", zeroImports],
      ["extra import", extraImport],
      ["duplicate import", duplicate],
      ["reordered imports", reordered],
      ["all imports late", late],
      ["rule before imports", ruleBeforeImports],
      ["rule between imports", ruleBetweenImports],
      ["media before imports", mediaBeforeImports],
      ["media between imports", mediaAfterFirstImport],
      ["nested import", nestedImport],
      ["unsupported import context", unsupportedContext]
    ] as const;

    for (const [label, css] of invalidCases) {
      expect(() => assertDesignContract(tokenCss, css, indexHtml), label).toThrow();
    }
    const commentedPhase = `/* before imports */\n${importLines[0]}\n/* between imports */\n${importLines.slice(1).join("\n")}\n/* after imports */\n${body}`;
    const normalCascade = `${consumerCss}\n.dp-type-h2 { font-size: var(--dp-type-body-sm-font-size); font-size: var(--dp-type-h2-font-size); }`;
    expect(() => assertDesignContract(tokenCss, commentedPhase, indexHtml)).not.toThrow();
    expect(() => assertDesignContract(tokenCss, normalCascade, indexHtml)).not.toThrow();

    const scratchRoot = createEnforcementScratch();
    try {
      for (const [label, css] of invalidCases) {
        expect(runScratchEnforcement(scratchRoot, css), `npm run enforce: ${label}`).toBe(1);
      }
      expect(runScratchEnforcement(scratchRoot, commentedPhase), "npm run enforce: comments within canonical phase").toBe(0);
      expect(runScratchEnforcement(scratchRoot, normalCascade), "npm run enforce: normal last-wins").toBe(0);
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  });

  it("rejects each modeled grid and alignment declaration on an unrelated selector", () => {
    const declarations = [
      "display: none", "grid: none", "grid-template: none", "grid-template-columns: none", "grid-template-rows: none",
      "grid-template-areas: none", "grid-auto-columns: none", "grid-auto-flow: row", "grid-auto-rows: none",
      "grid-column: 1", "grid-column-end: 1", "grid-column-start: 1", "grid-row: 1", "grid-row-end: 1",
      "grid-row-start: 1", "grid-area: auto", "grid-gap: 0", "grid-row-gap: 0", "grid-column-gap: 0", "gap: 0",
      "row-gap: 0", "column-gap: 0", "place-content: start", "place-items: start", "place-self: start"
    ];
    for (const declaration of declarations) {
      expect(() => assertDesignContract(tokenCss, `${consumerCss}\n[data-layout-probe] { ${declaration}; }`, indexHtml)).toThrow(/grid\/gap declaration inventory/);
    }
    expect(() => assertDesignContract(tokenCss, consumerCss, indexHtml)).not.toThrow();
  });

  it("rejects state-color tokens on role subjects while allowing only full role axes", () => {
    expect(() => assertDesignContract(tokenCss, `${consumerCss}\n.dp-type-h2 { color: var(--dp-color-signal-danger-text); }`, indexHtml)).toThrow(/only declares canonical typography axes/);
  });

  it("fails closed on unsupported CSS at-rules and noncanonical external imports", () => {
    expect(() => assertDesignContract(tokenCss, `${consumerCss}\n@container (min-width: 1px) { .dp-type-h2 { font-size: 12px; } }`, indexHtml)).toThrow(/unsupported consumer CSS at-rule/);
    expect(() => assertDesignContract(tokenCss, `${consumerCss}\n@import "https://example.invalid/override.css";`, indexHtml)).toThrow(/initial root import phase/);
  });

  it("binds intended DOM headings to their declared roles and rejects inline or art-mislabeled UI", () => {
    expect(domRoleFindings(tokenCss, indexHtml)).toEqual([]);
    const wrongHeading = indexHtml.replace('class="dp-type-h3" id="moduleNavigatorTitle"', 'class="dp-type-body-sm" id="moduleNavigatorTitle"');
    expect(domRoleFindings(tokenCss, wrongHeading).some(finding => finding.message.includes("#moduleNavigatorTitle must carry only its intended role dp-type-h3"))).toBe(true);
    const injectedUi = `${indexHtml}\n<p data-dp-art="canvas" style="font-size:12px">Non-art UI</p>`;
    const injectedFindings = domRoleFindings(tokenCss, injectedUi);
    expect(injectedFindings.some(finding => finding.message.includes("unchecked inline style"))).toBe(true);
    expect(injectedFindings.some(finding => finding.message.includes("mislabels authored DOM as canvas art"))).toBe(true);
  });

  it("does not treat script raw text as DOM or allow it to satisfy a required heading", () => {
    const actualHeading = '<h2 class="dp-type-h3" id="moduleNavigatorTitle">Navigate modules</h2>';
    const script = '<script type="module" src="/src/main.ts"><h2 class="dp-type-h3" id="moduleNavigatorTitle">Fake</h2></script>';
    const forgedScript = indexHtml.replace(actualHeading, "").replace('<script type="module" src="/src/main.ts"></script>', script);
    expect(() => domRoleFindings(tokenCss, forgedScript)).toThrow(/external script body must be empty/);

    const forgedTitle = indexHtml.replace(actualHeading, "").replace("</head>", `<title><h2 class="dp-type-h3" id="moduleNavigatorTitle">Fake</h2></title>\n</head>`);
    expect(domRoleFindings(tokenCss, forgedTitle).some(finding => finding.message.includes("required typography element #moduleNavigatorTitle is missing"))).toBe(true);
    const titleSubject = indexHtml.replace(actualHeading, "").replace("</head>", `<title class="dp-type-h3" id="moduleNavigatorTitle">Navigate modules</title>\n</head>`);
    expect(domRoleFindings(tokenCss, titleSubject).some(finding => finding.message.includes("#moduleNavigatorTitle must be <h2> in the intended child of <section>.module-navigator context"))).toBe(true);
    const scriptSubject = indexHtml.replace(actualHeading, "").replace('<script type="module" src="/src/main.ts"></script>', '<script id="moduleNavigatorTitle" class="dp-type-h3" type="module" src="/src/main.ts"></script>');
    expect(domRoleFindings(tokenCss, scriptSubject).some(finding => finding.message.includes("#moduleNavigatorTitle must be <h2> in the intended child of <section>.module-navigator context"))).toBe(true);
    const forgedTemplate = indexHtml.replace(actualHeading, "").replace("</body>", `<template><h2 class="dp-type-h3" id="moduleNavigatorTitle">Fake</h2></template>\n</body>`);
    expect(() => domRoleFindings(tokenCss, forgedTemplate)).toThrow(/unsupported authored HTML element <template>/);
    expect(domRoleFindings(tokenCss, indexHtml)).toEqual([]);
  });
});
