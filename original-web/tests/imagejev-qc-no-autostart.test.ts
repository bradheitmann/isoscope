import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(__dirname, "..", "scripts", "imagejev-qc.ts");

function freeClosedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

describe("imagejev-qc never starts the sidecar (D38)", () => {
  it("source contains no process-spawning code or sidecar supervisor reference", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).not.toMatch(/child_process/);
    expect(src).not.toMatch(/\b(spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(/);
    expect(src).not.toMatch(/Bun\.spawn|Bun\.\$/);
    expect(src).not.toMatch(/IMAGEJEV_SIDECAR|ensureSidecar/);
  });

  it("exits 2 with a manual-start message against a closed loopback port", async () => {
    const port = await freeClosedPort();
    const dir = mkdtempSync(join(tmpdir(), "imagejev-qc-"));
    const png = join(dir, "x.png");
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    try {
      const r = spawnSync("bun", [SCRIPT, png, "--endpoint", `http://127.0.0.1:${port}/v1`], {
        encoding: "utf8",
        timeout: 30_000,
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/sidecar is down/);
      expect(r.stderr).toMatch(/imagejev-sidecar\.ts ensure/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
