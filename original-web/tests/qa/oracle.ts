import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RoleTuple } from "./cssvars";

/* Independent oracle: canonical role tuples read straight from the vendored Desert Pants DTCG token JSON
   (tokens/*.tokens.json, each verified against CANONICAL-MANIFEST.sha256). Nothing here reads CSS, so
   agreement with the CSS-resolved values is a real cross-check rather than a self-consistency check. */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

const isObj = (v: Json | undefined): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export interface Canon {
  files: string[];
  /** role -> prop -> canonical string (web composite; compact size kept separately for fluid roles) */
  roles: Map<string, Map<string, string>>;
  compactSize: Map<string, string>;
  fluid: Map<string, { vw: number; offset: number; min?: number; max?: number }>;
}

function loadTokens(root: string): { files: string[]; tree: Obj } {
  const dir = join(root, "vendor/desert-pants");
  const manifest = readFileSync(join(dir, "CANONICAL-MANIFEST.sha256"), "utf8");
  const files: string[] = [];
  const tree: Obj = {};
  for (const line of manifest.split("\n")) {
    const m = /^([0-9a-f]{64})\s+(tokens\/[^\s]+\.tokens\.json)$/.exec(line.trim());
    if (!m) continue;
    const bytes = readFileSync(join(dir, m[2]!));
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (sha !== m[1]) throw new Error(`${m[2]} sha256 ${sha} does not match CANONICAL-MANIFEST ${m[1]}`);
    files.push(m[2]!);
    const doc = JSON.parse(bytes.toString("utf8")) as Obj;
    for (const [k, v] of Object.entries(doc)) if (!k.startsWith("$")) tree[k] = isObj(tree[k]) && isObj(v) ? { ...(tree[k] as Obj), ...v } : v!;
  }
  if (files.length === 0) {
    throw new Error("CANONICAL-MANIFEST.sha256 lists no tokens/*.tokens.json files, so there is no verified token oracle (the D13 manifest change adds them)");
  }
  return { files, tree };
}

function lookup(tree: Obj, path: string): Json {
  let cur: Json = tree;
  for (const part of path.split(".")) {
    if (!isObj(cur) || !(part in cur)) throw new Error(`unresolved token reference {${path}}`);
    cur = cur[part]!;
  }
  return cur;
}

/** Resolve "{a.b}" references (whole-value or nested) down to a plain $value. */
function deref(tree: Obj, v: Json, depth = 0): Json {
  if (depth > 20) throw new Error("reference cycle");
  if (typeof v === "string") {
    const m = /^\{([^}]+)\}$/.exec(v);
    if (!m) return v;
    const target = lookup(tree, m[1]!);
    return deref(tree, isObj(target) && "$value" in target ? target.$value! : target, depth + 1);
  }
  if (Array.isArray(v)) return v.map(x => deref(tree, x, depth + 1));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deref(tree, x, depth + 1)]));
  return v;
}

function dim(v: Json): string {
  if (isObj(v) && "value" in v && "unit" in v) return `${v.value}${v.unit}`;
  return String(v);
}

function ext(node: Obj): Obj {
  const e = node.$extensions;
  const dp = isObj(e) ? e["com.desertpants"] : undefined;
  return isObj(dp) ? dp : {};
}

export function loadCanon(root: string): Canon {
  const { files, tree } = loadTokens(root);
  const type = lookup(tree, "type") as Obj;
  const roles = new Map<string, Map<string, string>>();
  const compactSize = new Map<string, string>();
  const fluid = new Map<string, { vw: number; offset: number; min?: number; max?: number }>();
  for (const [role, def] of Object.entries(type)) {
    if (role.startsWith("$") || !isObj(def) || !isObj(def.web)) continue;
    const web = def.web;
    const value = deref(tree, web.$value) as Obj;
    const e = deref(tree, ext(web)) as Obj;
    const props = new Map<string, string>();
    props.set("font-family", (value.fontFamily as string[]).join(", "));
    props.set("font-size", dim(value.fontSize!));
    props.set("font-weight", String(value.fontWeight));
    props.set("line-height", dim(value.lineHeight!));
    props.set("letter-spacing", typeof e["tracking-em"] === "number" ? `${e["tracking-em"]}em` : e["tracking-em"] !== undefined ? dim(e["tracking-em"]) : dim(value.letterSpacing!));
    props.set("text-transform", typeof e["text-transform"] === "string" ? e["text-transform"] : "none");
    props.set("font-variant-numeric", typeof e["font-variant-numeric"] === "string" ? e["font-variant-numeric"] : "normal");
    roles.set(role, props);
    if (isObj(def.compact)) {
      const cv = deref(tree, def.compact.$value) as Obj;
      compactSize.set(role, dim(cv.fontSize!));
    }
    if (isObj(e.fluid) && typeof e.fluid.vw === "number") {
      const f = e.fluid;
      fluid.set(role, { vw: f.vw as number, offset: typeof f["offset-px"] === "number" ? f["offset-px"] : 0, ...(typeof f["min-px"] === "number" ? { min: f["min-px"] } : {}), ...(typeof f["max-px"] === "number" ? { max: f["max-px"] } : {}) });
    }
  }
  return { files, roles, compactSize, fluid };
}

/* ---- normalisation of CSS-side values ---- */

function topLevelArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) { out.push(inner.slice(start, i).trim()); start = i + 1; }
  }
  out.push(inner.slice(start).trim());
  return out;
}

function px(len: string): number | null {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(len.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
}

/** First length of min(a, b) (the uncapped design size), or the length itself. */
function baseSize(expr: string): number | null {
  const e = expr.trim();
  if (e.startsWith("min(") && e.endsWith(")")) return baseSize(topLevelArgs(e.slice(4, -1))[0]!);
  return px(e);
}

const familyKey = (s: string): string => topLevelArgs(s).map(f => f.replace(/["']/g, "").trim()).join("|");
const numKey = (s: string): string => { const m = /^(-?[\d.]+)([a-z%]*)$/.exec(s.trim()); return m ? (Number(m[1]) === 0 ? "0" : `${Number(m[1])}${m[2]}`) : s.trim(); };

export interface OracleResult { rolesChecked: number; tuplesChecked: number; mismatches: string[]; skippedRoles: string[];
  /** false when anything mismatched, any CSS .dp-type-* role is absent from the tokens, or 0 roles were checked */
  ok: boolean; }

export function checkAgainstCanon(canon: Canon, tuples: RoleTuple[]): OracleResult {
  const mismatches: string[] = [];
  const seen = new Set<string>();
  const skipped = new Set<string>();
  let n = 0;
  for (const t of tuples) {
    const expected = canon.roles.get(t.role);
    if (!expected) { skipped.add(t.role); continue; }
    if (t.value === null) continue;
    const want = expected.get(t.prop);
    if (want === undefined) continue;
    seen.add(t.role);
    n++;
    let ok: boolean;
    if (t.prop === "font-family") ok = familyKey(t.value) === familyKey(want);
    else if (t.prop === "font-size") {
      const web = baseSize(want);
      const compact = baseSize(canon.compactSize.get(t.role) ?? want);
      const v = t.value.trim();
      if (v.startsWith("clamp(")) {
        const [lo, mid, hi] = topLevelArgs(v.slice(6, -1));
        const f = canon.fluid.get(t.role);
        const m = /^(?:(-?[\d.]+)(rem|px)\s*\+\s*)?(-?[\d.]+)vw$/.exec(mid ?? "");
        const midOffset = m ? (m[1] === undefined ? 0 : Number(m[1]) * (m[2] === "rem" ? 16 : 1)) : null;
        ok = baseSize(lo!) === (f?.min ?? compact) && baseSize(hi!) === (f?.max ?? web) && f !== undefined && m !== null && Number(m[3]) === f.vw && Math.abs((midOffset ?? 0) - f.offset) < 0.01;
      } else {
        ok = baseSize(v) === web && !canon.fluid.has(t.role);
      }
    } else ok = numKey(t.value) === numKey(want);
    if (!ok) mismatches.push(`${t.role}/${t.prop}: css=${t.value} tokens=${want}`);
  }
  return { rolesChecked: seen.size, tuplesChecked: n, mismatches, skippedRoles: [...skipped],
    ok: mismatches.length === 0 && skipped.size === 0 && seen.size > 0 };
}
