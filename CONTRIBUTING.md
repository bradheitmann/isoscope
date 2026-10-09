# Contributing

Issues and PRs welcome. Ground rules:

- **TypeScript strict, no plain JS, no Python.** Rust is preferred for new
  standalone tools. (Yes, this is opinionated.)
- Gates before pushing: `cd original-web && npm run typecheck && npm test && npm run build`,
  and `bun test ./tests/` at the root. CI runs the same.
- The codebase map is generated: if you change module structure or file line
  counts, regenerate with `cd original-web && bun run regen:codebase-map` and
  commit the result (a test enforces byte-parity).
- Never commit media files, `annotations.local.json`, or `telemetry.db` —
  they are local-only by design.
- Keep spec JSON sanitized-input-safe: fields are rendered into the DOM through
  an allowlist; do not add raw-HTML interpolation paths.
