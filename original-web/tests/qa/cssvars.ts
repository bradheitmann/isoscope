/* Static typography check: parse CSS text, collect :root custom properties and .dp-type-* role
   rules, then resolve every var() chain to a literal value. No browser involved. */

export interface Rule {
  selector: string;
  decls: Array<[string, string]>;
  atDepth: number;
}

/** Minimal CSS reader: yields rules with their declarations; nested at-rule bodies are flagged by atDepth. */
export function parseRules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const stack: Array<{ selector: string; start: number; isAt: boolean }> = [];
  let buf = "";
  let atDepth = 0;
  let current: Rule | null = null;
  let paren = 0;
  let quote = "";
  const flushDecl = (): void => {
    const raw = buf.trim();
    buf = "";
    if (!raw || !current) return;
    const colon = raw.indexOf(":");
    if (colon < 0) return;
    current.decls.push([raw.slice(0, colon).trim(), raw.slice(colon + 1).trim()]);
  };
  for (const ch of text) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === "(") paren++;
    if (ch === ")") paren--;
    if (ch === "{" && paren === 0) {
      const selector = buf.trim();
      buf = "";
      const isAt = selector.startsWith("@");
      stack.push({ selector, start: rules.length, isAt });
      if (isAt) { atDepth++; current = null; }
      else { current = { selector, decls: [], atDepth }; rules.push(current); }
    } else if (ch === "}" && paren === 0) {
      if (current) flushDecl();
      const top = stack.pop();
      if (top?.isAt) atDepth--;
      buf = "";
      current = null;
    } else if (ch === ";" && paren === 0) {
      flushDecl();
    } else {
      buf += ch;
    }
  }
  return rules;
}

export type VarMap = Map<string, string>;

/** Custom properties declared on top-level :root rules; later declarations win. */
export function rootVars(rules: ReadonlyArray<Rule>): VarMap {
  const vars: VarMap = new Map();
  for (const rule of rules) {
    if (rule.atDepth !== 0) continue;
    if (!rule.selector.split(",").some(s => s.trim() === ":root")) continue;
    for (const [name, value] of rule.decls) if (name.startsWith("--")) vars.set(name, value);
  }
  return vars;
}

export class ResolveError extends Error {}

/** Replace every var(--x[, fallback]) with its literal value, following chains and detecting cycles. */
export function resolveValue(value: string, vars: VarMap, trail: string[] = []): string {
  let out = "";
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf("var(", i);
    if (at < 0) { out += value.slice(i); break; }
    out += value.slice(i, at);
    let depth = 1;
    let j = at + 4;
    while (j < value.length && depth > 0) {
      if (value[j] === "(") depth++;
      else if (value[j] === ")") depth--;
      j++;
    }
    if (depth !== 0) throw new ResolveError(`unbalanced var() in "${value}"`);
    const inner = value.slice(at + 4, j - 1);
    const comma = inner.indexOf(",");
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma < 0 ? null : inner.slice(comma + 1).trim();
    if (trail.includes(name)) throw new ResolveError(`cycle ${[...trail, name].join(" -> ")}`);
    const target = vars.get(name);
    if (target === undefined) {
      if (fallback === null) throw new ResolveError(`undefined ${name}`);
      out += resolveValue(fallback, vars, trail);
    } else {
      out += resolveValue(target, vars, [...trail, name]);
    }
    i = j;
  }
  return out.trim();
}

export const TYPE_PROPS = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-transform", "font-variant-numeric"] as const;

export interface RoleTuple {
  role: string;
  prop: string;
  literal: string;
  /** resolved value, or null on failure */
  value: string | null;
  error: string | null;
}

/** Resolve every declaration of every top-level `.dp-type-<role>` rule. */
export function typographyTuples(css: string): { tuples: RoleTuple[]; roles: string[]; variantTuples: RoleTuple[] } {
  const rules = parseRules(css);
  const vars = rootVars(rules);
  const tuples: RoleTuple[] = [];
  const roles: string[] = [];
  for (const rule of rules) {
    if (rule.atDepth !== 0) continue;
    const match = /^\.dp-type-([a-z0-9-]+)$/.exec(rule.selector.trim());
    if (!match) continue;
    const role = match[1]!;
    roles.push(role);
    for (const [prop, literal] of rule.decls) {
      if (!(TYPE_PROPS as readonly string[]).includes(prop)) continue;
      try {
        tuples.push({ role, prop, literal, value: resolveValue(literal, vars), error: null });
      } catch (error) {
        tuples.push({ role, prop, literal, value: null, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  /* also resolve the -web and -compact variant tokens declared for each role */
  const variantTuples: RoleTuple[] = [];
  for (const role of roles) {
    for (const variant of ["web", "compact"]) {
      for (const prop of TYPE_PROPS) {
        const name = `--dp-type-${role}-${variant}-${prop}`;
        const literal = vars.get(name);
        if (literal === undefined) continue;
        try {
          variantTuples.push({ role: `${role}/${variant}`, prop, literal, value: resolveValue(literal, vars), error: null });
        } catch (error) {
          variantTuples.push({ role: `${role}/${variant}`, prop, literal, value: null, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
  }
  return { tuples, roles, variantTuples };
}
