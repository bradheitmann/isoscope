import { createHash } from "node:crypto";
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/**
 * Trust anchors checked against the Desert Pants checkout when this lane was
 * cut. The manifest digest is deliberately in code, not derived from the
 * vendored manifest: changing both an asset and its manifest entry cannot
 * approve the changed bytes.
 */
export const CANONICAL_SOURCE_COMMIT = "ba99de27974f623c20679962e8e3dc4d74c2a273";
export const CANONICAL_MANIFEST_SHA256 = "3017ea2f8796b54007f4e8a8d3b6516f63241b3e082e6fdcf95568a7ef208bc5";
// The original vendor snapshot also carries source token JSON and the Lucide
// notice, which the upstream-generated asset manifest omitted. Bind those
// files independently instead of treating arbitrary extra files as trusted.
const CANONICAL_UNMANIFESTED_ASSETS: Readonly<Record<string, string>> = {
  "tokens/01-primitives.tokens.json": "b5299147c69fbb1b663f334341a525c7cd7952d3fd8afe424b885c14e3f45a4c",
  "tokens/02-semantic.tokens.json": "97c70c09b27cadaa63b6eb57910a27914d829b22651218607ff67bb7c7562b10",
  "tokens/03-typography.tokens.json": "cc9af3681c290f890fb5d665f487fdf4c58c516aac25d33cdf8aee4d5dbc7f0c",
  "tokens/04-layout.tokens.json": "97f2ccfdab39310cad27cda5fd24e9dd9011be3544cac86b16899b82161bc004",
  "tokens/05-motion.tokens.json": "dd59b17246825a02234ec4c3e8c1e2bb51add5c152f8189c26dd825e5df5ccd6",
  "tokens/06-effects.tokens.json": "55977b9d86a1b54dabc781f979127e8b03a1053d0e43f7c4d4cfc63ceb31cca9",
  "tokens/07-print.tokens.json": "1b7094be5b3135b0c90cfef26f393f9e229e60faa2760c7bf854bddbdc906e80",
  "tokens/08-components.tokens.json": "bce55963ea91a32f2627b070f33312395abdd7cc035180bf9afd71f3f89ae501",
  "tokens/09-terminal.tokens.json": "588d2d266aedf25c978b0eaf2c7394b5db5b98c97de25a7f42a139e2b52d3460"
};

const TYPOGRAPHY_PROPERTIES = [
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-transform",
  "font-variant-numeric"
] as const;
const COMPONENT_TYPE_RECIPES: Readonly<Record<string, string>> = {
  ".grouphead": "--dp-component-side-nav-title-type",
  ".keyrow": "--dp-component-scene-label-type",
  ".lbl": "--dp-component-scene-label-type",
  ".lbl .id": "--dp-component-scene-node-meta-type"
};

type Declarations = Map<string, string>;

export interface ContractFinding {
  readonly file: string;
  readonly message: string;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function walkFiles(directory: string): string[] {
  const paths: string[] = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`vendor tree contains a symlink: ${path}`);
    }
    if (stat.isDirectory()) paths.push(...walkFiles(path));
    else if (stat.isFile()) paths.push(path);
    else throw new Error(`vendor tree contains a non-file entry: ${path}`);
  }
  return paths;
}

function parseManifest(manifest: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [index, line] of manifest.split(/\r?\n/).entries()) {
    if (!line) continue;
    const match = /^([a-f0-9]{64})  ([^\0]+)$/.exec(line);
    if (!match) throw new Error(`invalid manifest line ${index + 1}`);
    const digest = match[1];
    const name = match[2];
    if (name === "CANONICAL-MANIFEST.sha256" || name.startsWith("/") || name.split(/[\\/]/).includes("..")) {
      throw new Error(`unsafe or self-referential manifest path at line ${index + 1}`);
    }
    if (entries.has(name)) throw new Error(`duplicate manifest path: ${name}`);
    entries.set(name, digest);
  }
  if (entries.size === 0) throw new Error("canonical asset manifest is empty");
  return entries;
}

/** Validate vendored bytes against both the immutable source revision and manifest digest. */
export function verifyCanonicalVendor(vendorRoot: string): void {
  const vendor = resolve(vendorRoot);
  const manifestPath = join(vendor, "CANONICAL-MANIFEST.sha256");
  const provenancePath = join(vendor, "PROVENANCE.md");
  const manifestBytes = readFileSync(manifestPath);
  const actualManifestHash = sha256(manifestBytes);
  if (actualManifestHash !== CANONICAL_MANIFEST_SHA256) {
    throw new Error(`vendored manifest digest mismatch: expected ${CANONICAL_MANIFEST_SHA256}, got ${actualManifestHash}`);
  }

  const provenance = readFileSync(provenancePath, "utf8");
  if (!provenance.includes(`commit \`${CANONICAL_SOURCE_COMMIT}\``)) {
    throw new Error(`provenance does not identify pinned Desert Pants commit ${CANONICAL_SOURCE_COMMIT}`);
  }

  const expected = parseManifest(manifestBytes.toString("utf8"));
  const actualFiles = walkFiles(vendor)
    .map(path => relative(vendor, path).split(sep).join("/"))
    .filter(path => path !== "CANONICAL-MANIFEST.sha256" && path !== "PROVENANCE.md")
    .sort();
  const normalizedActual = actualFiles.map(path => path.toLowerCase()).sort();
  const normalizedExpected = [...expected.keys(), ...Object.keys(CANONICAL_UNMANIFESTED_ASSETS)]
    .map(path => path.toLowerCase()).sort();
  if (new Set(normalizedActual).size !== normalizedActual.length || JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    const missing = normalizedExpected.filter(path => !normalizedActual.includes(path));
    const extra = normalizedActual.filter(path => !normalizedExpected.includes(path));
    throw new Error(`vendored asset inventory differs from canonical manifest (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`);
  }

  const actualByFoldedPath = new Map(actualFiles.map(path => [path.toLowerCase(), path]));
  for (const [path, expectedHash] of [...expected, ...Object.entries(CANONICAL_UNMANIFESTED_ASSETS)]) {
    const actualPath = actualByFoldedPath.get(path.toLowerCase());
    if (!actualPath) throw new Error(`canonical asset is missing: ${path}`);
    const actualHash = sha256(readFileSync(join(vendor, actualPath)));
    if (actualHash !== expectedHash) throw new Error(`vendored asset digest mismatch: ${path}`);
  }
}

function parseDeclarations(body: string): Declarations {
  const declarations: Declarations = new Map();
  for (const declaration of body.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim().replace(/\s*!important\s*$/i, "").trim();
    if (property) declarations.set(property, value);
  }
  return declarations;
}

function cssRules(css: string): Array<{ selector: string; declarations: Declarations }> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Array<{ selector: string; declarations: Declarations }> = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of withoutComments.matchAll(rulePattern)) {
    const selector = match[1].trim();
    if (selector.startsWith("@")) continue;
    rules.push({ selector, declarations: parseDeclarations(match[2]) });
  }
  return rules;
}

function typographyRecipes(css: string): Map<string, Declarations> {
  const recipes = new Map<string, Declarations>();
  for (const rule of cssRules(css)) {
    const match = /^\.dp-type-([a-z0-9-]+)$/.exec(rule.selector);
    if (match) recipes.set(`dp-type-${match[1]}`, rule.declarations);
  }
  return recipes;
}

function classNames(selector: string): string[] {
  return [...selector.matchAll(/\.([a-z_][a-z0-9_-]*)/gi)].map(match => match[1]);
}

/**
 * Check consumer CSS role use against the exact generated compound recipe.
 * UI rules may add layout/color, but cannot override one axis of a canonical
 * typography role with another individually-valid token.
 */
export function typographyRoleFindings(canonicalCss: string, consumerCss: string, file = "styles.css"): ContractFinding[] {
  const recipes = typographyRecipes(canonicalCss);
  const findings: ContractFinding[] = [];
  for (const rule of cssRules(consumerCss)) {
    const roleClasses = classNames(rule.selector).filter(name => name.startsWith("dp-type-"));
    const componentPrefix = COMPONENT_TYPE_RECIPES[rule.selector];
    const hasTypography = TYPOGRAPHY_PROPERTIES.some(property => rule.declarations.has(property)) || rule.declarations.has("font");
    if (roleClasses.length === 0 && componentPrefix === undefined && !hasTypography) continue;

    if (roleClasses.length === 0 && componentPrefix === undefined) {
      // The one inherited recipe is a supplied canonical list-row component;
      // no local font axis is allowed to replace its generated component role.
      if (rule.selector === ".module-results .dp-list-row" && rule.declarations.get("font") === "inherit" && TYPOGRAPHY_PROPERTIES.every(property => !rule.declarations.has(property))) continue;
      findings.push({ file, message: `${rule.selector} declares typography without a canonical whole-role recipe` });
      continue;
    }

    if (roleClasses.length > 1) {
      findings.push({ file, message: `${rule.selector} combines multiple typography roles in one authored rule` });
      continue;
    }
    const roleClass = roleClasses[0];
    const recipe = roleClass ? recipes.get(roleClass) : undefined;
    if (roleClass && !recipe) {
      findings.push({ file, message: `${rule.selector} uses undefined canonical typography role .${roleClass}` });
      continue;
    }
    const prefix = recipe ? undefined : componentPrefix;
    for (const property of TYPOGRAPHY_PROPERTIES) {
      const actual = rule.declarations.get(property);
      if (recipe && actual === undefined) continue;
      const suffix = property === "font-family" ? "font-family"
        : property === "font-size" ? "font-size"
        : property === "font-weight" ? "font-weight"
        : property === "line-height" ? "line-height"
        : property === "letter-spacing" ? "letter-spacing"
        : property === "text-transform" ? "text-transform"
        : "font-variant-numeric";
      const expected = recipe?.get(property) ?? (prefix ? `var(${prefix}-${suffix})` : undefined);
      if (actual !== expected) {
        findings.push({
          file,
          message: `${rule.selector} ${actual === undefined ? "omits" : `sets ${property} to ${actual};`} canonical whole-role recipe requires ${expected ?? "no declaration"}`
        });
      }
    }
    if (rule.declarations.has("font")) findings.push({ file, message: `${rule.selector} uses font shorthand instead of explicit whole-role typography axes` });
  }
  return findings;
}

/** Compare the generated complete class recipe against all seven token axes. */
export function canonicalRoleCompletenessFindings(canonicalCss: string): ContractFinding[] {
  const findings: ContractFinding[] = [];
  const declaredVariables = new Set([...canonicalCss.matchAll(/(--dp-[a-z0-9-]+)\s*:/g)].map(match => match[1]));
  for (const [role, declarations] of typographyRecipes(canonicalCss)) {
    for (const property of TYPOGRAPHY_PROPERTIES) {
      const value = declarations.get(property);
      const suffix = property === "font-family" ? "font-family"
        : property === "font-size" ? "font-size"
        : property === "font-weight" ? "font-weight"
        : property === "line-height" ? "line-height"
        : property === "letter-spacing" ? "letter-spacing"
        : property === "text-transform" ? "text-transform"
        : "font-variant-numeric";
      const expected = `var(--${role}-${suffix})`;
      if (value !== expected) {
        findings.push({ file: "tokens.css", message: `.${role} does not resolve ${property} through its generated canonical role variable` });
      } else if (!declaredVariables.has(`--${role}-${suffix}`)) {
        findings.push({ file: "tokens.css", message: `.${role} references missing canonical variable --${role}-${suffix}` });
      }
    }
    if (declarations.has("font")) findings.push({ file: "tokens.css", message: `.${role} uses font shorthand instead of the complete generated role axes` });
  }
  if (typographyRecipes(canonicalCss).size === 0) findings.push({ file: "tokens.css", message: "no generated canonical typography recipes were found" });
  return findings;
}

/** Reject missing token references in consumer UI rules instead of accepting inherited browser defaults. */
export function missingTokenFindings(canonicalCss: string, consumerCss: string, file = "styles.css"): ContractFinding[] {
  const declared = new Set<string>();
  for (const match of canonicalCss.matchAll(/(--dp-[a-z0-9-]+)\s*:/g)) declared.add(match[1]);
  const findings: ContractFinding[] = [];
  for (const match of consumerCss.matchAll(/var\(\s*(--dp-[a-z0-9-]+)/g)) {
    if (!declared.has(match[1])) findings.push({ file, message: `references undefined canonical token ${match[1]}` });
  }
  return findings;
}

export function assertDesignContract(canonicalCss: string, consumerCss: string): void {
  const findings = [
    ...canonicalRoleCompletenessFindings(canonicalCss),
    ...typographyRoleFindings(canonicalCss, consumerCss),
    ...missingTokenFindings(canonicalCss, consumerCss)
  ];
  if (findings.length > 0) throw new Error(findings.map(finding => `${finding.file}: ${finding.message}`).join("\n"));
}
