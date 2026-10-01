# Vendored Desert Pants web assets

Source: [`bradheitmann/desert-pants`](https://github.com/bradheitmann/desert-pants) at commit `74777b54301ebfa8c63649adb559a1256160f6fa` (2026-09-26).

The canonical checkout's requested candidate commit was re-read before vendoring. Its tracked generated web files matched that commit (`git diff --quiet HEAD -- build/web/...` exited 0), and each copied file below passed its matching SHA-256 entry from the source repository's `SHA256SUMS` manifest.

Copied generated web outputs: `build/web/fonts.css`, `themes.css`, `themes.json`, `themes.ts`, `tokens.css`, and `tokens.json`. Copied fonts and OFL licenses: `fonts/`.

`themes.json` is the complete generated theme inventory and role map. Theme IDs, labels, mode names, and colors must be derived from that file; do not hand-maintain a second theme list. `tokens.json` provides the generated token metadata. CSS and font paths retain the source package's relative directory structure.
