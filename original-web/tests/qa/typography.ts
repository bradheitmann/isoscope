import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Session } from "./cdp";
import { typographyTuples, type RoleTuple } from "./cssvars";
import { checkAgainstCanon, loadCanon, type Canon } from "./oracle";
import type { Recorder } from "./report";

const C = "typography";

function checkSource(rec: Recorder, label: string, css: string, canon: Canon | null): RoleTuple[] {
  const { tuples, roles, variantTuples } = typographyTuples(css);
  const bad = [...tuples, ...variantTuples].filter(t => t.value === null || t.value === "" || t.value.includes("var("));
  rec.check(C, `${label}: roles found`, roles.length > 0, `${roles.length} .dp-type-* roles, ${tuples.length} role tuples, ${variantTuples.length} web/compact variant tuples`);
  rec.check(C, `${label}: every var() chain resolves to a literal`, bad.length === 0,
    bad.length === 0 ? `${tuples.length + variantTuples.length} tuples, 0 mismatches` : `${bad.length} unresolved, first: ${bad.slice(0, 3).map(b => `${b.role}/${b.prop}: ${b.error ?? b.value}`).join("; ")}`);
  if (canon) {
    const r = checkAgainstCanon(canon, tuples);
    rec.check(C, `${label}: roles match vendored token JSON (independent oracle)`, r.ok,
      `${r.rolesChecked} roles checked, ${r.tuplesChecked} tuples, ${r.mismatches.length} mismatches` + (r.mismatches.length ? `, first: ${r.mismatches.slice(0, 3).join("; ")}` : "") + (r.skippedRoles.length ? `; ${r.skippedRoles.length} CSS roles not in tokens (FAIL): ${r.skippedRoles.join(", ")}` : ""));
  }
  return tuples;
}

/** No-browser check over the vendored token CSS and, when built, the dist CSS. Returns tuples for the browser check. */
export function staticTypography(rec: Recorder, appRoot: string): RoleTuple[] {
  const tokens = readFileSync(join(appRoot, "vendor/desert-pants/build/web/tokens.css"), "utf8");
  let canon: Canon | null = null;
  try {
    canon = loadCanon(appRoot);
    rec.check(C, "oracle: token JSON loaded and manifest hashes verified", canon.roles.size > 0, `${canon.files.length} manifest-listed files (${canon.files.join(", ")}), ${canon.roles.size} canonical roles`);
  } catch (error) {
    rec.check(C, "oracle: token JSON loaded and manifest hashes verified", false, error instanceof Error ? error.message : String(error));
  }
  const tuples = checkSource(rec, "vendored tokens.css", tokens, canon);
  const assets = join(appRoot, "dist/assets");
  if (existsSync(assets)) {
    for (const file of readdirSync(assets).filter(f => f.endsWith(".css"))) {
      checkSource(rec, `dist/assets/${file}`, readFileSync(join(assets, file), "utf8"), canon);
    }
  } else {
    rec.observe(C, "dist css", "dist/ not built; built-CSS pass skipped (run npm run build first)", "skipped");
  }
  return tuples;
}

const PROP_TO_STYLE: Record<string, string> = {
  "font-family": "fontFamily", "font-size": "fontSize", "font-weight": "fontWeight", "line-height": "lineHeight",
  "letter-spacing": "letterSpacing", "text-transform": "textTransform", "font-variant-numeric": "fontVariantNumeric"
};

/** In-browser: computed style of `.dp-type-<role>` must equal computed style of an element carrying the statically resolved literals. */
export async function computedTypography(rec: Recorder, session: Session, tuples: RoleTuple[]): Promise<void> {
  const byRole = new Map<string, Record<string, string>>();
  for (const t of tuples) {
    if (t.value === null) continue;
    const entry = byRole.get(t.role) ?? {};
    entry[PROP_TO_STYLE[t.prop] ?? t.prop] = t.value;
    byRole.set(t.role, entry);
  }
  const payload = JSON.stringify([...byRole]);
  const mismatches = await session.eval<string[]>(`(() => {
    const roles = ${payload};
    const out = [];
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden";
    document.body.appendChild(host);
    for (const [role, props] of roles) {
      const a = document.createElement("span"); a.className = "dp-type-" + role; a.textContent = "x";
      const b = document.createElement("span"); b.textContent = "x";
      for (const [k, v] of Object.entries(props)) b.style.setProperty(k.replace(/[A-Z]/g, m => "-" + m.toLowerCase()), v);
      host.append(a, b);
      const ca = getComputedStyle(a), cb = getComputedStyle(b);
      for (const k of Object.keys(props)) if (ca[k] !== cb[k]) out.push(role + "/" + k + ": class=" + ca[k] + " resolved=" + cb[k]);
    }
    host.remove();
    return out;
  })()`);
  const tupleCount = [...byRole.values()].reduce((n, p) => n + Object.keys(p).length, 0);
  rec.check(C, "computed style equals statically resolved literals", mismatches.length === 0,
    mismatches.length === 0 ? `${byRole.size} roles, ${tupleCount} tuples, 0 mismatches` : `${mismatches.length} mismatches, first: ${mismatches.slice(0, 3).join("; ")}`);
}
