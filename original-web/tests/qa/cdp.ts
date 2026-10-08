/* Raw CDP over the built-in WebSocket (works in Bun and Node 22). */
import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { sleep } from "./procs";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type Listener = (params: Record<string, unknown>) => void;

export class Session {
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Map<string, Listener[]>();
  readonly exceptions: string[] = [];
  readonly consoleErrors: string[] = [];

  private constructor(private readonly ws: WebSocket, private readonly browserPort: number, readonly targetId: string) {}

  static async open(browserPort: number): Promise<Session> {
    const response = await fetch(`http://127.0.0.1:${browserPort}/json/new?about:blank`, { method: "PUT" });
    const target = (await response.json()) as { id: string; webSocketDebuggerUrl: string };
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("CDP websocket error"));
    });
    const session = new Session(ws, browserPort, target.id);
    ws.onmessage = event => session.dispatch(JSON.parse(String(event.data)) as Record<string, unknown>);
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    session.on("Runtime.exceptionThrown", params => {
      const details = params["exceptionDetails"] as { text?: string; exception?: { description?: string } } | undefined;
      session.exceptions.push((details?.exception?.description ?? details?.text ?? "exception").slice(0, 300));
    });
    session.on("Runtime.consoleAPICalled", params => {
      if (params["type"] !== "error") return;
      const args = (params["args"] as Array<{ value?: unknown; description?: string }> | undefined) ?? [];
      session.consoleErrors.push(args.map(a => String(a.value ?? a.description ?? "")).join(" ").slice(0, 300));
    });
    return session;
  }

  private dispatch(message: Record<string, unknown>): void {
    const id = message["id"];
    if (typeof id === "number") {
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      const error = message["error"] as { message?: string } | undefined;
      if (error) entry.reject(new Error(error.message ?? "CDP error"));
      else entry.resolve(message["result"]);
      return;
    }
    const method = message["method"];
    if (typeof method === "string") for (const listener of this.listeners.get(method) ?? []) listener((message["params"] as Record<string, unknown>) ?? {});
  }

  on(method: string, listener: Listener): void {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
  }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluate an expression in the page; promises are awaited; throws on page exceptions. */
  async eval<T>(expression: string): Promise<T> {
    const result = await this.send<{ result: { value?: T }; exceptionDetails?: { text?: string; exception?: { description?: string } } }>(
      "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }
    );
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "evaluate failed");
    return result.result.value as T;
  }

  async navigate(url: string, readyExpression: string, timeoutMs = 90000): Promise<void> {
    await this.send("Page.navigate", { url });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await this.eval<boolean>(`Boolean(${readyExpression})`)) return;
      } catch { /* context not ready */ }
      await sleep(250);
    }
    throw new Error(`page not ready: ${readyExpression}`);
  }

  setViewport(width: number, height: number, deviceScaleFactor = 1): Promise<unknown> {
    return this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile: false });
  }

  setReducedMotion(reduce: boolean): Promise<unknown> {
    return this.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }] });
  }

  async key(key: string, code: string, keyCode: number): Promise<void> {
    const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
    await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  }

  async screenshot(path: string): Promise<void> {
    const shot = await this.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
    writeFileSync(path, Buffer.from(shot.data, "base64"));
  }

  async close(): Promise<void> {
    try { this.ws.close(); } catch { /* closed */ }
    try { await fetch(`http://127.0.0.1:${this.browserPort}/json/close/${this.targetId}`); } catch { /* browser gone */ }
  }
}
