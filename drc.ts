#!/usr/bin/env bun
/* isoscope DRC — collision-avoidance lint (DESIGN-RULES R17).
   Routes the spec with the SAME shared router the engine uses and fails if
   weighted crossings exceed the spec's acknowledged budget.
     bun drc.ts <spec.json | store.db> [--budget N]
   Budget precedence: --budget > spec.drcBudget.maxWeightedCrossings > 0 (strict).
   Weighting: perpendicular crossing = 1 · shared channel = 4 (worse than a cross). */
import { readFileSync } from "fs";
import { isoRouteAll } from "./router.mjs";
import { open, exportSpec } from "./lib.ts";

const [target, ...rest] = Bun.argv.slice(2);
if (!target) { console.error("usage: drc.ts <spec.json | store.db> [--budget N]"); process.exit(2); }
const spec = target.endsWith(".json")
  ? JSON.parse(readFileSync(target, "utf8"))
  : exportSpec(open(target));
const bIdx = rest.indexOf("--budget");
const budget = bIdx >= 0 ? Number(rest[bIdx + 1])
  : (spec.drcBudget?.maxWeightedCrossings ?? 0);

const { qc } = isoRouteAll(spec.nodes, spec.edges);
console.log(`isoscope drc · ${spec.nodes.length} modules · ${qc.edges} links`);
console.log(`weighted crossings: ${qc.weighted}   budget: ${budget}   (${qc.crossings} crossing${qc.crossings === 1 ? "" : "s"} rendered as hops · ${qc.shares} shared channel${qc.shares === 1 ? "" : "s"})`);
console.log(`lanes_assigned: ${qc.lanes_assigned}   corridors_resolved: ${qc.corridors_resolved}   unresolved_shares: ${qc.unresolved_shares.length}`);
for (const share of qc.unresolved_shares)
  console.log(`  unresolved ${share.keys.join(" / ")}: ${share.reason}`);
if (qc.hubs.length) console.log(`hubs with escape pins (R13): ${qc.hubs.join(", ")}`);
if (qc.offenders.length) {
  console.log("offenders (worst first):");
  for (const o of qc.offenders) console.log(`  ${o.key}  weighted ${o.weighted}`);
}
if (qc.weighted > budget) {
  console.error(`FAIL — ${qc.weighted} > ${budget}. Reduce crossings (move modules, rethink links) or acknowledge the architecture with drcBudget.maxWeightedCrossings in the spec.`);
  process.exit(1);
}
console.log("PASS — the board routes within its acknowledged budget.");
