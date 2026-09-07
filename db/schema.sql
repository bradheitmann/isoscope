-- isoscope graph store · plain SQLite, graph-shaped, zero dependencies (bun:sqlite)
-- One row per node, one row per edge; edge attributes live ON the edge.
-- spec.json remains the interchange format: cli.ts converts db ⇄ spec losslessly.

CREATE TABLE IF NOT EXISTS meta (            -- project header: title, wordmark, asOf,
  key   TEXT PRIMARY KEY,                    -- brand.k, brand.v, intro.*, metrics (JSON)
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  ord   INTEGER NOT NULL                     -- sidebar order
);

CREATE TABLE IF NOT EXISTS nodes (
  id    TEXT PRIMARY KEY,
  tag   TEXT,
  grp   TEXT NOT NULL REFERENCES groups(id),
  name  TEXT NOT NULL,
  short TEXT,                                -- 1–2 word map label
  x REAL NOT NULL, y REAL NOT NULL,          -- grid position
  w REAL NOT NULL DEFAULT 1, d REAL NOT NULL DEFAULT 1, h REAL NOT NULL DEFAULT 1,
  stack INTEGER,                             -- sliced floors (optional)
  level INTEGER NOT NULL DEFAULT 0,          -- stratum: -1 | 0 | +1 (Stack mode)
  state TEXT NOT NULL DEFAULT 'ok'           -- ok | attn | build  (red item ⇒ blocked)
    CHECK (state IN ('ok','attn','build')),
  does  TEXT, built TEXT, refs TEXT,         -- inspector prose (HTML allowed)
  good  TEXT, cond  TEXT
);

CREATE TABLE IF NOT EXISTS status_items (    -- open items per node, severity-classed
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  ord     INTEGER NOT NULL,
  class   TEXT NOT NULL CHECK (class IN ('red','amber','you')),
  label   TEXT NOT NULL,
  PRIMARY KEY (node_id, ord)
);

CREATE TABLE IF NOT EXISTS edges (           -- links are entities
  src     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  dst     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type    TEXT NOT NULL DEFAULT 'data' CHECK (type IN ('data','auth','intended')),
  health  TEXT CHECK (health IN ('degraded','broken')),
  title   TEXT,                              -- edge inspector headline
  carries TEXT,                              -- "what flows here"
  refs    TEXT,
  PRIMARY KEY (src, dst)
);

CREATE TABLE IF NOT EXISTS trace_steps (     -- the guided story, in order
  ord       INTEGER PRIMARY KEY,
  src       TEXT NOT NULL,
  dst       TEXT NOT NULL,
  narration TEXT NOT NULL,
  FOREIGN KEY (src, dst) REFERENCES edges(src, dst) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telemetry (       -- seams → sensors: one sensor binding per module
  node_id        TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  trace_boundary TEXT NOT NULL               -- proposed | offered | installed | verified | declined
    CHECK (trace_boundary IN ('proposed','offered','installed','verified','declined')),
  event_stream    TEXT,                      -- e.g. lumbr://billing/*
  wide_event_keys TEXT,                      -- JSON array of key names
  installed_by    TEXT,                      -- provenance: agent | human | pipeline
  offered_at      TEXT, verified_at TEXT,
  rationale       TEXT                       -- why this seam earned a sensor
);

CREATE TABLE IF NOT EXISTS node_paths (      -- path ownership: findings attribute here
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  prefix  TEXT NOT NULL,                     -- longest-prefix match wins
  PRIMARY KEY (node_id, prefix)
);

-- Operational history survives graph replacement/deletion; deliberately no FK.
CREATE TABLE IF NOT EXISTS node_history (
  node_id TEXT NOT NULL,
  at TEXT NOT NULL,
  session TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('created','moved','resized','renamed',
    'redocumented','status','edge_added','edge_removed','edge_changed',
    'path','telemetry','deleted')),
  detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS node_history_node_session ON node_history(node_id,session);
CREATE INDEX IF NOT EXISTS node_history_session ON node_history(session);
