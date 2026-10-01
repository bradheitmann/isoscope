# Integrated web candidate

Scoped source commit e4949da was integrated as d267e67. On the integration
worktree, `npm ci`, all 17 tests, strict `tsc --noEmit` and Vite production build
passed. Canonical Desert Pants binary lint with `--deny-warnings` checked ten
source files with zero errors/warnings. The CSS-only repair independently went
from 325 findings to zero, including logical sides for RTL. The asset ratchet
binds 22 canonical generated/font/license assets plus UPSTREAM, checks complete
inventory, and hashes an aggregate manifest bound to source 74777b5.

An actual npm audit found high Vite development-server advisories and a critical
Vitest UI-server advisory in the original tooling pins. Vite 7.1.7 was upgraded
to patched 7.3.6. Vitest's 3.2.7 patch still retained the moderate mocker advisory,
so the test runner was upgraded to registry-current 5.0.3, compatible with Vite 7
and the observed Node 26.10.0. Only package requirements/lock changed; all 17
tests and strict production build passed again. `npm audit` now reports zero
vulnerabilities. No forced audit command, advisory suppression or test weakening
was used. Advisory authority: GHSA-5xrq-8626-4rwp, GHSA-82fw-gwwq-j7x9 and the
Vite findings returned by npm's registry audit.

The Rust server at http://127.0.0.1:4185 serves this worktree's built dist with
same-origin snapshot/graph endpoints. ETags avoid repeatedly parsing unchanged
captures; stale/error/UNKNOWN coverage remains visible. Independent integrated
client review is pending. The Three.js lazy chunk is about 532 KB / 134 KB gzip
and exceeds Vite's default 500 KB warning; the warning was retained. The imported
canonical stylesheet is about 1.23 MB / 132 KB gzip. Bundle sizes are transfer
observations, not measured render performance or proof of improvement. See
FRONTEND.md for the implementation lane's browser observations and limitations.
