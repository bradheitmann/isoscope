# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub's private vulnerability
reporting (Security tab → Report a vulnerability) rather than in a public issue.
You can expect an acknowledgment within a few days.

## Scope notes

Isoscope is a local-first visualization tool. The dev server binds localhost and
is intended for local use. The upload endpoint enforces an inert-file allowlist
(no HTML/SVG/scriptable types) because uploads are served back from the app
origin; spec JSON loaded via `?spec=` is sanitized through an allowlist renderer
before insertion into the DOM. If you find a path around either, it is in scope.

## Root CLI live server

`serve` is loopback-only and authenticates graph reads, writes and SSE. Browser
access uses a one-use handoff and an HttpOnly SameSite=Strict session cookie.
API clients must configure a bearer token of at least 32 characters. The root
viewer and original-web share an HTML allowlist; graph prose is untrusted.
The server rejects direct provider webhooks: use a signature-verifying trusted
adapter or import payloads locally. Do not expose the local server publicly.
`install-hook` quotes every filename and refuses to overwrite an existing hook.
