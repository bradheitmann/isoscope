import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

test("root and original-web isoscope.spec.json self-maps are byte-identical", () => {
  const a = readFileSync(join(root, "examples/isoscope.spec.json"));
  const b = readFileSync(join(root, "original-web/examples/isoscope.spec.json"));
  expect(Buffer.compare(a, b)).toBe(0);
});
