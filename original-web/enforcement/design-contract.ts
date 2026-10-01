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
export const CANONICAL_MANIFEST_SHA256 = "1d92f2e00d8934bd240f6918f16d4e9c49b6172f0b42925443fc1d5887e4d3db";
// The vendor snapshot also carries the remaining source token JSON files,
// which the upstream-generated asset manifest omits. Bind them independently
// instead of treating arbitrary extra files as trusted. The corrected layout
// source is now an explicit manifest entry.
const CANONICAL_UNMANIFESTED_ASSETS: Readonly<Record<string, string>> = {
  "tokens/01-primitives.tokens.json": "b5299147c69fbb1b663f334341a525c7cd7952d3fd8afe424b885c14e3f45a4c",
  "tokens/02-semantic.tokens.json": "97c70c09b27cadaa63b6eb57910a27914d829b22651218607ff67bb7c7562b10",
  "tokens/03-typography.tokens.json": "cc9af3681c290f890fb5d665f487fdf4c58c516aac25d33cdf8aee4d5dbc7f0c",
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
const REQUIRED_DOM_ROLES: Readonly<Record<string, string>> = {
  brandV: "dp-type-brand-name",
  pEyebrow: "dp-type-label-sm",
  pTitle: "dp-type-h2",
  pSub: "dp-type-body-sm",
  moduleNavigatorTitle: "dp-type-h3",
  moduleResults: "dp-type-meta",
  pProse: "dp-type-body-sm",
  sideKey: "dp-type-body-sm",
  asOf: "dp-type-body-sm"
};
const CANONICAL_CSS_IMPORTS = [
  "../vendor/desert-pants/build/web/fonts.css",
  "../vendor/desert-pants/build/web/tokens.css",
  "../vendor/desert-pants/build/web/themes.css",
  "../vendor/desert-pants/reference/base.css",
  "../vendor/desert-pants/reference/components.css"
] as const;

type Declarations = Map<string, string>;
interface ConsumerRule {
  readonly selector: string;
  readonly declarations: Declarations;
  readonly media: readonly string[];
}

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

function stripCssComments(css: string): string {
  let output = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index] ?? "";
    if (char === "\\") throw new Error("consumer CSS escape sequences are unsupported; use literal canonical identifiers");
    if (quote) {
      output += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      output += char;
      continue;
    }
    if (char === "/" && css[index + 1] === "*") {
      const close = css.indexOf("*/", index + 2);
      if (close < 0) throw new Error("consumer CSS contains an unterminated comment");
      output += " ";
      index = close + 1;
      continue;
    }
    output += char;
  }
  if (quote) throw new Error("consumer CSS contains an unterminated string");
  return output;
}

function findCssDelimiter(source: string, start: number, delimiters: ReadonlySet<string>): number {
  let quote: "'" | '"' | null = null;
  let parentheses = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "(") parentheses += 1;
    else if (char === ")") {
      parentheses -= 1;
      if (parentheses < 0) throw new Error("consumer CSS has an unmatched closing parenthesis");
    } else if (parentheses === 0 && delimiters.has(char)) return index;
  }
  if (quote || parentheses !== 0) throw new Error("consumer CSS has an unterminated string or function");
  return source.length;
}

function findCssBlockEnd(source: string, opening: number): number {
  let depth = 1;
  let quote: "'" | '"' | null = null;
  for (let index = opening + 1; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("consumer CSS has an unclosed rule block");
}

function splitCssDeclarations(body: string): string[] {
  const parts: string[] = [];
  let start = 0;
  while (start < body.length) {
    const end = findCssDelimiter(body, start, new Set([";", "{", "}"]));
    const part = body.slice(start, end).trim();
    if (end < body.length && (body[end] === "{" || body[end] === "}")) {
      throw new Error("nested blocks in a consumer style rule are unsupported");
    }
    if (part) parts.push(part);
    start = end + 1;
  }
  return parts;
}

function parseConsumerDeclarations(body: string): Declarations {
  const declarations: Declarations = new Map();
  for (const part of splitCssDeclarations(body)) {
    const colon = findCssDelimiter(part, 0, new Set([":"]));
    if (colon >= part.length) throw new Error(`consumer CSS declaration lacks a colon: ${part}`);
    const property = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (!/^(?:--[a-z0-9-]+|[a-z][a-z0-9-]*)$/.test(property) || !value) {
      throw new Error(`unsupported consumer CSS declaration syntax: ${part}`);
    }
    declarations.set(property, value);
  }
  return declarations;
}

function cssRules(css: string): ConsumerRule[] {
  const source = stripCssComments(css);
  const rules: ConsumerRule[] = [];
  const imports: string[] = [];

  function parseRuleList(startAt: number, allowAtRules: boolean, allowClosingBrace: boolean, media: readonly string[]): number {
    let position = startAt;
    while (position < source.length) {
      while (/\s/.test(source[position] ?? "")) position += 1;
      if (position >= source.length) return position;
      if (source[position] === "}") {
        if (allowClosingBrace) return position;
        throw new Error("consumer CSS contains an unmatched closing brace");
      }
      const delimiter = findCssDelimiter(source, position, new Set(["{", ";", "}"]));
      const head = source.slice(position, delimiter).trim();
      if (!head) throw new Error("consumer CSS contains an empty selector or statement");
      const stop = source[delimiter];
      if (stop === ";") {
        const importMatch = /^@import\s+["']([^"']+)["']$/.exec(head);
        if (!importMatch || !CANONICAL_CSS_IMPORTS.includes(importMatch[1] as (typeof CANONICAL_CSS_IMPORTS)[number])) {
          throw new Error(`unsupported consumer CSS statement or import: ${head}`);
        }
        imports.push(importMatch[1]);
        position = delimiter + 1;
        continue;
      }
      if (stop === "}") return delimiter;
      if (stop !== "{") throw new Error(`consumer CSS rule is missing a block: ${head}`);
      const end = findCssBlockEnd(source, delimiter);
      const body = source.slice(delimiter + 1, end);
      if (head.startsWith("@")) {
        if (!allowAtRules || !/^@media\b/.test(head)) throw new Error(`unsupported consumer CSS at-rule: ${head}`);
        const nestedEnd = parseRuleList(delimiter + 1, true, true, [...media, head.toLowerCase().replace(/\s+/g, " ")]);
        if (source[nestedEnd] !== "}") throw new Error(`unclosed consumer CSS at-rule: ${head}`);
      } else {
        rules.push({ selector: head, declarations: parseConsumerDeclarations(body), media });
      }
      position = end + 1;
    }
    return position;
  }

  const finalPosition = parseRuleList(0, true, false, []);
  if (finalPosition !== source.length) throw new Error("consumer CSS has trailing unsupported syntax");
  if (JSON.stringify(imports) !== JSON.stringify(CANONICAL_CSS_IMPORTS)) {
    throw new Error("consumer CSS must import exactly the five pinned Desert Pants stylesheets in canonical order");
  }
  return rules;
}

function typographyRecipes(css: string): Map<string, Declarations> {
  const recipes = new Map<string, Declarations>();
  // This input is the byte-pinned generated upstream stylesheet. Its source
  // grammar is trusted after the vendor SHA check, so extract only the exact
  // emitted single-class role selectors; authored consumer CSS uses the strict
  // parser above.
  for (const match of css.matchAll(/(?:^|\n)\s*\.dp-type-([a-z0-9-]+)\s*\{([^{}]*)\}/g)) {
    const roleClass = `dp-type-${match[1]}`;
    recipes.set(roleClass, parseDeclarations(match[2]));
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
    for (const property of rule.declarations.keys()) {
      if (property === "all") findings.push({ file, message: `${rule.selector} uses forbidden CSS reset property all` });
      if (property.startsWith("--dp-")) findings.push({ file, message: `${rule.selector} redefines reserved canonical token ${property}` });
      if (property.startsWith("font-") && !TYPOGRAPHY_PROPERTIES.includes(property as (typeof TYPOGRAPHY_PROPERTIES)[number])) {
        findings.push({ file, message: `${rule.selector} uses unmodeled typography property ${property}` });
      }
    }
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
    if (roleClass && rule.selector !== `.${roleClass}`) {
      findings.push({ file, message: `${rule.selector} must use a direct single-role selector subject; selector branches and polarity are unsupported` });
      continue;
    }
    if (roleClass && [...rule.declarations.keys()].some(property => !TYPOGRAPHY_PROPERTIES.includes(property as (typeof TYPOGRAPHY_PROPERTIES)[number]))) {
      findings.push({ file, message: `${rule.selector} only declares canonical typography axes; component color/state styling belongs on semantic component selectors` });
      continue;
    }
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

/** Bind the authored workflow grid to the pinned Desert Pants workbench recipe. */
export function workbenchLayoutFindings(canonicalCss: string, consumerCss: string, file = "styles.css"): ContractFinding[] {
  const findings: ContractFinding[] = [];
  const allRules = cssRules(consumerCss);
  const layoutProperties = new Set([
    "display", "grid", "grid-template", "grid-template-columns", "grid-template-rows", "grid-template-areas",
    "grid-auto-columns", "grid-auto-flow", "grid-auto-rows", "grid-column", "grid-row", "grid-area",
    "gap", "row-gap", "column-gap", "place-content", "place-items"
  ]);
  for (const rule of allRules) {
    if (rule.selector.includes("workbench") && rule.selector !== ".workbench" && [...rule.declarations.keys()].some(property => layoutProperties.has(property))) {
      findings.push({ file, message: `${rule.selector} cannot alter the workbench grid; use the direct canonical .workbench recipe selector` });
    }
  }
  const rules = allRules.filter(rule => rule.selector === ".workbench");
  const wide = rules.filter(rule => rule.media.length === 0);
  const breakpointValues = [...canonicalCss.matchAll(/(?:^|\n)\s*--dp-breakpoint-lg:\s*([0-9]+px);/g)].map(match => match[1]);
  if (breakpointValues.length !== 1) findings.push({ file: "tokens.css", message: `expected one canonical breakpoint.lg value, found ${breakpointValues.length}` });
  const breakpoint = breakpointValues[0] ?? "unresolved-canonical-breakpoint";
  const compact = rules.filter(rule => rule.media.length === 1 && rule.media[0] === `@media (max-width: ${breakpoint})`);
  if (rules.length !== wide.length + compact.length) {
    findings.push({ file, message: ".workbench layout rules use an unapproved media context" });
  }
  if (wide.length !== 1) findings.push({ file, message: `expected one wide workbench grid rule, found ${wide.length}` });
  if (compact.length !== 1) findings.push({ file, message: `expected one compact workbench grid rule, found ${compact.length}` });

  const tokenPrefix = "--dp-layout-grid-component-visualization-workbench-";
  const expectedWide = {
    display: "grid",
    "grid-template-columns": `var(${tokenPrefix}rail-width) minmax(0, 1fr) minmax(var(${tokenPrefix}reading-min-width), var(${tokenPrefix}reading-preferred-width))`,
    gap: `var(${tokenPrefix}gap)`
  } as const;
  const expectedCompact = {
    "grid-template-columns": `var(${tokenPrefix}rail-width) minmax(0, 1fr)`,
    gap: `var(${tokenPrefix}compact-gap)`
  } as const;
  const declared = new Set([...canonicalCss.matchAll(/(--dp-[a-z0-9-]+)\s*:/g)].map(match => match[1]));
  const required = ["rail-width", "reading-min-width", "reading-preferred-width", "gap", "compact-gap", "reading-breakpoint"];
  for (const token of required) {
    if (!declared.has(`${tokenPrefix}${token}`)) findings.push({ file: "tokens.css", message: `pinned workbench grid recipe is missing ${tokenPrefix}${token}` });
  }
  const breakpointAlias = [...canonicalCss.matchAll(new RegExp(`(?:^|\\n)\\s*${tokenPrefix}reading-breakpoint:\\s*([^;]+);`, "g"))].map(match => match[1]);
  if (breakpointAlias.length !== 1 || breakpointAlias[0] !== "var(--dp-breakpoint-lg)") {
    findings.push({ file: "tokens.css", message: "workbench reading-breakpoint must resolve through canonical breakpoint.lg" });
  }
  const check = (rule: ConsumerRule | undefined, expected: Readonly<Record<string, string>>, label: string): void => {
    if (!rule) return;
    for (const [property, value] of Object.entries(expected)) {
      if (rule.declarations.get(property) !== value) {
        findings.push({ file, message: `${label} workbench grid requires ${property}: ${value}` });
      }
    }
  };
  check(wide[0], expectedWide, "wide");
  check(compact[0], expectedCompact, "compact");
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
  for (const match of consumerCss.matchAll(/var\(\s*(--dp-[a-z0-9-]+)/gi)) {
    if (!declared.has(match[1])) findings.push({ file, message: `references undefined canonical token ${match[1]}` });
  }
  return findings;
}

interface StaticElement {
  readonly tag: string;
  readonly attributes: ReadonlyMap<string, string | null>;
}

function findHtmlTagEnd(html: string, start: number): number {
  let quote: "'" | '"' | null = null;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index] ?? "";
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === ">") return index;
  }
  throw new Error("authored HTML contains an unterminated tag");
}

function parseHtmlAttributes(source: string): Map<string, string | null> {
  const attributes = new Map<string, string | null>();
  let position = 0;
  while (position < source.length) {
    while (/\s/.test(source[position] ?? "")) position += 1;
    if (position >= source.length) break;
    if (source[position] === "/") throw new Error("unexpected slash before end of HTML attributes");
    const nameMatch = /^[a-zA-Z_:][a-zA-Z0-9_:.-]*/.exec(source.slice(position));
    if (!nameMatch) throw new Error(`unsupported HTML attribute syntax near: ${source.slice(position, position + 30)}`);
    const name = nameMatch[0].toLowerCase();
    position += nameMatch[0].length;
    while (/\s/.test(source[position] ?? "")) position += 1;
    let value: string | null = null;
    if (source[position] === "=") {
      position += 1;
      while (/\s/.test(source[position] ?? "")) position += 1;
      const quote = source[position];
      if (quote === "'" || quote === '"') {
        position += 1;
        const close = source.indexOf(quote, position);
        if (close < 0) throw new Error(`unterminated quoted HTML attribute ${name}`);
        value = source.slice(position, close);
        position = close + 1;
      } else {
        const unquoted = /^[^\s>]+/.exec(source.slice(position));
        if (!unquoted) throw new Error(`empty unquoted HTML attribute ${name}`);
        value = unquoted[0];
        position += unquoted[0].length;
      }
    }
    if (attributes.has(name)) throw new Error(`duplicate HTML attribute ${name}`);
    attributes.set(name, value);
  }
  return attributes;
}

function parseStaticHtml(html: string): StaticElement[] {
  const elements: StaticElement[] = [];
  let position = 0;
  while (position < html.length) {
    const opening = html.indexOf("<", position);
    if (opening < 0) break;
    if (html.startsWith("<!--", opening)) {
      const close = html.indexOf("-->", opening + 4);
      if (close < 0) throw new Error("authored HTML has an unterminated comment");
      position = close + 3;
      continue;
    }
    const close = findHtmlTagEnd(html, opening + 1);
    const text = html.slice(opening, close + 1);
    if (/^<!doctype\s+html\s*>$/i.test(text)) {
      position = close + 1;
      continue;
    }
    if (text.startsWith("</")) {
      if (!/^<\/[a-zA-Z][a-zA-Z0-9:-]*\s*>$/.test(text)) throw new Error(`unsupported closing HTML tag: ${text}`);
      position = close + 1;
      continue;
    }
    if (text.startsWith("<!") || text.startsWith("<?")) throw new Error(`unsupported HTML declaration: ${text}`);
    const tagMatch = /^<([a-zA-Z][a-zA-Z0-9:-]*)([\s\S]*?)>$/.exec(text);
    if (!tagMatch) throw new Error(`unsupported HTML tag syntax: ${text}`);
    const tag = tagMatch[1].toLowerCase();
    const attributes = parseHtmlAttributes(tagMatch[2].replace(/\/\s*$/, ""));
    elements.push({ tag, attributes });
    position = close + 1;
    if (tag === "style") throw new Error("inline style elements are unsupported; use the checked consumer stylesheet");
    if (["iframe", "object", "embed"].includes(tag) || attributes.has("srcdoc")) {
      throw new Error(`embedded document content is unsupported in authored HTML: <${tag}>`);
    }
    if (tag === "script" && !attributes.has("src")) throw new Error("inline scripts are unsupported by the static DOM contract");
  }
  return elements;
}

export function domRoleFindings(canonicalCss: string, html: string): ContractFinding[] {
  const elements = parseStaticHtml(html);
  const roles = new Set(typographyRecipes(canonicalCss).keys());
  const findings: ContractFinding[] = [];
  const scripts = elements.filter(element => element.tag === "script");
  if (scripts.length !== 1 || scripts[0]?.attributes.get("src") !== "/src/main.ts" || scripts[0]?.attributes.get("type") !== "module") {
    findings.push({ file: "index.html", message: "authored HTML must load only the approved Isoscope module entry point" });
  }
  if (elements.some(element => element.tag === "link")) {
    findings.push({ file: "index.html", message: "external link elements are unsupported; use the pinned stylesheet imports" });
  }
  const byId = new Map<string, StaticElement>();
  for (const element of elements) {
    if (element.attributes.has("style")) findings.push({ file: "index.html", message: `<${element.tag}> uses an unchecked inline style attribute` });
    if ([...element.attributes.keys()].some(name => /^on[a-z]+$/.test(name))) findings.push({ file: "index.html", message: `<${element.tag}> uses an unchecked inline event handler` });
    if (element.attributes.has("data-dp-art")) findings.push({ file: "index.html", message: `<${element.tag}> mislabels authored DOM as canvas art` });
    const id = element.attributes.get("id");
    if (id) {
      if (byId.has(id)) findings.push({ file: "index.html", message: `duplicate authored element id ${id}` });
      else byId.set(id, element);
    }
    const classes = (element.attributes.get("class") ?? "").split(/\s+/).filter(Boolean);
    const appliedRoles = classes.filter(name => name.startsWith("dp-type-"));
    if (new Set(appliedRoles).size > 1) findings.push({ file: "index.html", message: `<${element.tag}> has conflicting typography roles ${appliedRoles.join(", ")}` });
    for (const role of appliedRoles) {
      if (!roles.has(role)) findings.push({ file: "index.html", message: `element uses undefined canonical typography role ${role}` });
    }
  }
  for (const [id, expectedRole] of Object.entries(REQUIRED_DOM_ROLES)) {
    const element = byId.get(id);
    if (!element) {
      findings.push({ file: "index.html", message: `required typography element #${id} is missing` });
      continue;
    }
    const classes = (element.attributes.get("class") ?? "").split(/\s+/);
    if (classes.filter(name => name.startsWith("dp-type-")).join(" ") !== expectedRole) {
      findings.push({ file: "index.html", message: `#${id} must carry only its intended role ${expectedRole}` });
    }
  }
  const body = elements.filter(element => element.tag === "body");
  if (body.length !== 1 || (body[0]?.attributes.get("class") ?? "").split(/\s+/).filter(name => name.startsWith("dp-type-")).join(" ") !== "dp-type-body-sm") {
    findings.push({ file: "index.html", message: "body must carry the intended dp-type-body-sm base role exactly once" });
  }
  return findings;
}

export function assertDesignContract(canonicalCss: string, consumerCss: string, html: string): void {
  const findings = [
    ...canonicalRoleCompletenessFindings(canonicalCss),
    ...typographyRoleFindings(canonicalCss, consumerCss),
    ...workbenchLayoutFindings(canonicalCss, consumerCss),
    ...missingTokenFindings(canonicalCss, consumerCss),
    ...domRoleFindings(canonicalCss, html)
  ];
  if (findings.length > 0) throw new Error(findings.map(finding => `${finding.file}: ${finding.message}`).join("\n"));
}
