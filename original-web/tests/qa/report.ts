export type Status = "pass" | "fail" | "observed" | "pending-owner-ruling" | "skipped";

export interface Result {
  contract: string;
  name: string;
  status: Status;
  detail: string;
  /** drain-list id when a failure reflects a known product defect */
  finding?: string;
}

export class Recorder {
  readonly results: Result[] = [];

  add(result: Result): void {
    this.results.push(result);
    const tag = result.status.toUpperCase().padEnd(20);
    console.log(`${tag} ${result.contract} :: ${result.name}${result.finding ? ` [${result.finding}]` : ""}\n${" ".repeat(21)}${result.detail}`);
  }

  check(contract: string, name: string, ok: boolean, detail: string, finding?: string): void {
    const base = { contract, name, status: (ok ? "pass" : "fail") as Status, detail };
    this.add(finding ? { ...base, finding } : base);
  }

  observe(contract: string, name: string, detail: string, status: Status = "observed"): void {
    this.add({ contract, name, status, detail });
  }

  summary(): string {
    const byContract = new Map<string, Record<string, number>>();
    for (const r of this.results) {
      const row = byContract.get(r.contract) ?? {};
      row[r.status] = (row[r.status] ?? 0) + 1;
      byContract.set(r.contract, row);
    }
    const lines = ["", "== QA summary =="];
    for (const [contract, row] of byContract) {
      lines.push(`${contract.padEnd(28)} ${Object.entries(row).map(([k, v]) => `${k}=${v}`).join(" ")}`);
    }
    const fails = this.results.filter(r => r.status === "fail");
    lines.push(`total=${this.results.length} fail=${fails.length}`);
    for (const f of fails) lines.push(`  FAIL ${f.contract} :: ${f.name}${f.finding ? ` [${f.finding}]` : ""} -- ${f.detail}`);
    return lines.join("\n");
  }
}
