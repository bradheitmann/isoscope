import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertDesignContract, CANONICAL_SOURCE_COMMIT, verifyCanonicalVendor } from "./design-contract.ts";

const root = resolve(import.meta.dirname, "..");
const vendor = resolve(root, "vendor/desert-pants");
verifyCanonicalVendor(vendor);
assertDesignContract(
  readFileSync(resolve(vendor, "build/web/tokens.css"), "utf8"),
  readFileSync(resolve(root, "src/styles.css"), "utf8")
);
console.log(`Desert Pants source ${CANONICAL_SOURCE_COMMIT}, vendored byte inventory, and static stylesheet typography recipes verified.`);
