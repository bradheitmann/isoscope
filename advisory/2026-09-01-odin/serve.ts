/* isoscope advisory static server — serves this directory at :4180 (zero-dep, Bun).
   Usage: bun advisory/2026-09-01-odin/serve.ts   (Ctrl-C or kill to stop)        */
const DIR = import.meta.dir;
const PORT = 4180;
const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  json: "application/json; charset=utf-8",
  js: "text/javascript", mjs: "text/javascript", ts: "text/plain",
  css: "text/css", png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8",
};
Bun.serve({
  port: PORT,
  async fetch(req) {
    let path = new URL(req.url).pathname;
    if (path === "/" || path.endsWith("/")) path += "index.html";
    const file = Bun.file(DIR + decodeURIComponent(path));
    if (await file.exists()) {
      const ext = path.split(".").pop() ?? "txt";
      return new Response(file, { headers: { "content-type": TYPES[ext] ?? "application/octet-stream" } });
    }
    return new Response("not found — try /", { status: 404 });
  },
});
console.log(`isoscope advisory: serving ${DIR} at http://localhost:${PORT}/`);
