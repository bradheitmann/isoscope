import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const holder = join(import.meta.dir, "fixtures", "profile-holder.ts");

async function runAndSignal(signal: "SIGINT" | "SIGTERM"): Promise<{ dir: string; code: number | null }> {
  const proc = Bun.spawn(["bun", holder], { stdout: "pipe", stderr: "ignore" });
  const reader = proc.stdout.getReader();
  let text = "";
  while (!text.includes("\n")) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  const dir = text.trim();
  expect(existsSync(dir)).toBe(true);
  proc.kill(signal);
  const code = await proc.exited;
  return { dir, code };
}

test("chrome profile dir is removed on SIGTERM", async () => {
  const { dir, code } = await runAndSignal("SIGTERM");
  expect(existsSync(dir)).toBe(false);
  expect(code).toBe(143);
});

test("chrome profile dir is removed on SIGINT", async () => {
  const { dir, code } = await runAndSignal("SIGINT");
  expect(existsSync(dir)).toBe(false);
  expect(code).toBe(130);
});
