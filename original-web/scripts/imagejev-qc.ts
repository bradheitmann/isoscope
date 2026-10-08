#!/usr/bin/env bun
/* ImageJev visual QC harness. Strict TypeScript, run with bun.

   Sends a rendered layout PNG to the LOCAL ImageJev-4B sidecar (MLX LoRA over
   Qwen3.5-4B VL, served by mlx_vlm.server; see llm-serve docs/ai/IMAGEJEV-VISION-QC.md)
   over its OpenAI-compatible /v1/chat/completions endpoint and prints the model's
   bounded verdict. This is the SEMANTIC layer: advisory only. The deterministic
   geometry checks in scripts/edge-layout-qc.ts remain authoritative — this model
   can flag a suspicious render, it can never accept, pass, or release a layout.

   Offline-safe: if the sidecar is down or unreachable, exits 2 with a clear error.
   No keys required: the sidecar is loopback-only with no auth.

   Usage:
     bun scripts/imagejev-qc.ts <layout.png> [--endpoint http://127.0.0.1:8022/v1]
                                            [--question "..."] [--max-tokens 256]
*/
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const opt = (n: string, d: string): string => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const positional = args.filter((a, i) => !a.startsWith("--") && (i === 0 || args[i - 1] !== "--endpoint" && args[i - 1] !== "--question" && args[i - 1] !== "--max-tokens"));
const PNG = positional[0];
const ENDPOINT = opt("--endpoint", process.env.IMAGEJEV_ENDPOINT ?? "http://127.0.0.1:8022/v1").replace(/\/$/, "");
const QUESTION = opt(
  "--question",
  "Does this circuit-board layout have any malformed elbows, unnecessary bridges, or self-crossing lines? answer with a short verdict",
);
const MAX_TOKENS = Math.max(1, Number(opt("--max-tokens", "256")) || 256);
/* mlx_vlm.server keys its model cache on the exact preloaded model path and
   inherits the preloaded LoRA adapter only for a request whose `model` equals
   that path. A request naming anything else CLEARS the cache and reloads
   without the adapter — so the default is the sidecar's documented path. */
const MODEL_OVERRIDE = opt("--model", process.env.IMAGEJEV_MODEL ?? "");
const TIMEOUT_MS = 120_000;

if (!PNG) {
  console.error("usage: bun scripts/imagejev-qc.ts <layout.png> [--endpoint URL] [--question TEXT] [--max-tokens N]");
  process.exit(2);
}

interface ChatMessage {
  role: "user";
  content: (
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  )[];
}
interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/* The sidecar routes on the `model` field; the correct id is the preloaded
   base-model path (see note above). Default to the documented install path;
   override with --model / IMAGEJEV_MODEL. */
async function resolveModelId(): Promise<string> {
  if (MODEL_OVERRIDE) return MODEL_OVERRIDE;
  const { homedir } = await import("node:os");
  return `${homedir()}/local-llm/models/imajev-4b/base`;
}

/* Activate the sidecar via the llm-serve lifecycle supervisor (start-on-demand +
   5-min idle shutdown). Returns true if the endpoint is serving after ensure. */
async function ensureSidecar(): Promise<boolean> {
  const { homedir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const sup = process.env.IMAGEJEV_SIDECAR ?? `${homedir()}/open_protocols/llm-serve/bin/imagejev-sidecar.ts`;
  try {
    spawnSync("bun", [sup, "ensure"], { stdio: "inherit", timeout: 150_000 });
  } catch { return false; }
  try {
    const r = await fetch(`${ENDPOINT}/models`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}

async function main(): Promise<void> {
  const modelId = await resolveModelId();
  let png: Buffer;
  try {
    png = await readFile(PNG);
  } catch {
    console.error(`imagejev-qc: cannot read image: ${PNG}`);
    process.exit(2);
  }
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const body = {
    model: modelId,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: QUESTION },
        ],
      } satisfies ChatMessage,
    ],
    max_tokens: MAX_TOKENS,
    temperature: 0,
  };
  /* verify → activate → call. Isoscope assumes the sidecar is NOT running: health-check
     it, and if down, activate it via the llm-serve supervisor (which also owns the
     5-minute idle shutdown). Only a genuinely unreachable/failed activation degrades. */
  const call = async (): Promise<Response> =>
    fetch(`${ENDPOINT}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  let res: Response;
  try {
    res = await call();
  } catch {
    /* endpoint down — try to activate the sidecar, then retry exactly once */
    const activated = await ensureSidecar();
    if (!activated) {
      console.error(
        `imagejev-qc: ImageJev sidecar unavailable at ${ENDPOINT} and could not be activated. ` +
          `Deterministic QC (edge-layout-qc.ts) still applies — the model is advisory, never required.`,
      );
      process.exit(2);
    }
    try { res = await call(); }
    catch (err) {
      console.error(`imagejev-qc: sidecar still unreachable after activation (${err instanceof Error ? err.message : String(err)}). Deterministic QC still applies.`);
      process.exit(2);
    }
  }
  const json = (await res.json().catch(() => null)) as ChatCompletion | null;
  if (!res.ok || !json) {
    console.error(`imagejev-qc: sidecar returned HTTP ${res.status}: ${json?.error?.message ?? "unparseable response"}`);
    process.exit(2);
  }
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    /* Per llm-serve docs/ai/CONTRACTS.md: blank visible output is a FAILED serve. */
    console.error("imagejev-qc: FAILED serve — completion had no visible output");
    process.exit(3);
  }
  console.log(text);
  if (json.usage) {
    console.error(
      `[imagejev-4b via ${ENDPOINT} — prompt:${json.usage.prompt_tokens ?? "?"} completion:${json.usage.completion_tokens ?? "?"} tokens]`,
    );
  }
}

await main();
