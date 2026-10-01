import {
  Activity,
  ArrowUpRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileClock,
  GitBranch,
  Layers3,
  ListFilter,
  Network,
  Orbit,
  Search,
  ShieldAlert,
  Waypoints,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { lazy, Suspense } from "react";
import { buildMapModel, exactHeadVerdict, formatAge, snapshotFreshness } from "./data";
import { bootstrapFeed, refreshFeed, startPolling } from "./feed";
import { applyTheme, modeLabel, themeInventory } from "./theme";
import type { ColorMode, ThemeInfo } from "./theme";
import type { FeedState, MapNode, SnapshotItem } from "./types";

type View = "map" | "queue" | "evidence";

const stageOrder = ["blocked", "running", "claimed", "ready", "qa", "guard", "planned", "delivered", "merged", "closed", "unknown"];
const TopologyCanvas = lazy(() => import("./TopologyCanvas").then((module) => ({ default: module.TopologyCanvas })));

export type DpIconMetric =
  | `--dp-icon-size-${10 | 12 | 13 | 14 | 15 | 16 | 18 | 24 | 28}`
  | `--dp-icon-stroke-${"fine" | "caret" | "regular" | "arrow" | "bold"}`;

export function dpIconMetric(token: DpIconMetric): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const value = Number.parseFloat(raw);
  if (raw.length === 0 || !Number.isFinite(value)) throw new Error(`Missing Desert Pants icon metric ${token}.`);
  return value;
}

function stageClass(stage: string): string {
  if (["blocked"].includes(stage)) return "stage-pill stage-pill--danger";
  if (["running", "claimed"].includes(stage)) return "stage-pill stage-pill--info";
  if (["ready", "qa", "guard", "attn"].includes(stage)) return "stage-pill stage-pill--warning";
  if (["delivered", "merged", "closed", "ok"].includes(stage)) return "stage-pill stage-pill--success";
  return "stage-pill stage-pill--muted";
}

function shortHash(value: string | null | undefined): string {
  return value === null || value === undefined || value.length === 0 ? "—" : value.slice(0, 9);
}

function formatTime(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length === 0) return "Not recorded";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed)
    : value;
}

function ageFor(item: SnapshotItem, now: number): string {
  if (typeof item.stage_age_seconds === "number") return formatAge(item.stage_age_seconds);
  if (item.stage_since === null || item.stage_since === undefined) return "Age unknown";
  const timestamp = Date.parse(item.stage_since);
  if (!Number.isFinite(timestamp) || now < timestamp) return "Age unknown";
  return formatAge(Math.floor((now - timestamp) / 1000));
}

function displayStatus(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") return "Unknown";
  return value;
}

function ThemePicker({ themeId, mode, onTheme, onMode }: {
  themeId: string;
  mode: ColorMode;
  onTheme: (id: string) => void;
  onMode: (mode: ColorMode) => void;
}): JSX.Element {
  const selected = themeInventory.find((theme) => theme.id === themeId) ?? themeInventory[0];
  return (
    <div className="theme-picker">
      <label className="theme-picker__select-label" htmlFor="theme-choice">Palette</label>
      <select id="theme-choice" className="theme-picker__select" value={selected?.id ?? "desert"} onChange={(event) => onTheme(event.target.value)}>
        {themeInventory.map((theme: ThemeInfo) => (
          <option key={theme.id} value={theme.id}>{theme.name} · {theme.light.name} / {theme.dark.name}</option>
        ))}
      </select>
      <div className="theme-picker__modes" role="group" aria-label="Color appearance">
        {(["system", "light", "dark"] as const).map((entry) => (
          <button
            type="button"
            key={entry}
            className={mode === entry ? "theme-mode is-active" : "theme-mode"}
            onClick={() => onMode(entry)}
            aria-pressed={mode === entry}
            aria-label={`${modeLabel(entry)} color appearance`}
          >{entry === "system" ? "Auto" : entry[0]?.toUpperCase() ?? entry}</button>
        ))}
      </div>
    </div>
  );
}

function SideRail({ view, onView, repository }: { view: View; onView: (next: View) => void; repository: string }): JSX.Element {
  const links: Array<{ view: View; label: string; Icon: typeof Network }> = [
    { view: "map", label: "Map", Icon: Network },
    { view: "queue", label: "Work queue", Icon: ListFilter },
    { view: "evidence", label: "Evidence", Icon: FileClock },
  ];
  return (
    <aside className="rail" aria-label="Primary navigation">
      <a className="brand-mark" href="#map" aria-label="Isoscope home"><Waypoints size={dpIconMetric("--dp-icon-size-24")} strokeWidth={dpIconMetric("--dp-icon-stroke-regular")} /><span>IS</span></a>
      <div className="rail__divider" />
      <div className="rail__repo" title={repository} aria-label={`Repository ${repository}`}>
        <span className="rail__repo-mark">{repository.split("/").at(-1)?.slice(0, 1).toUpperCase() ?? "I"}</span>
      </div>
      <nav className="rail__nav">
        {links.map(({ view: target, label, Icon }) => (
          <button
            type="button"
            key={target}
            className={view === target ? "rail-link is-current" : "rail-link"}
            aria-label={label}
            aria-current={view === target ? "page" : undefined}
            onClick={() => onView(target)}
          ><Icon size={dpIconMetric("--dp-icon-size-18")} strokeWidth={dpIconMetric("--dp-icon-stroke-regular")} /><span className="rail-link__tip">{label}</span></button>
        ))}
      </nav>
      <div className="rail__bottom">
        <button type="button" className="rail-link" aria-label="Keyboard and help information" title="Keyboard and help"><CircleHelp size={dpIconMetric("--dp-icon-size-18")} strokeWidth={dpIconMetric("--dp-icon-stroke-regular")} /><span className="rail-link__tip">Help & keys</span></button>
        <span className="rail__version">0.1</span>
      </div>
    </aside>
  );
}

function Header({ feed, themeId, mode, onTheme, onMode, onRefresh, now }: {
  feed: FeedState;
  themeId: string;
  mode: ColorMode;
  onTheme: (id: string) => void;
  onMode: (mode: ColorMode) => void;
  onRefresh: () => void;
  now: number;
}): JSX.Element {
  const snapshot = feed.snapshot;
  const freshness = feed.source === "fixture"
    ? { label: "Illustrative only", tone: "unknown", stale: true }
    : snapshotFreshness(snapshot, feed.receivedAt, now, feed.lastFailure);
  return (
    <header className="topbar">
      <div className="topbar__location">
        <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb__slash">/</span><strong>{snapshot?.repository ?? "System map"}</strong></div>
        <span className="topbar__branch"><GitBranch size={dpIconMetric("--dp-icon-size-13")} /> {shortHash(snapshot?.plan_commit)}</span>
      </div>
      <div className="topbar__right">
        <div className={`freshness freshness--${freshness.tone}`} role="status" aria-live="polite">
          <span className="freshness__dot" />
          <span>{freshness.label}</span>
        </div>
        {feed.source === "api" && (
          <button type="button" className="icon-button topbar__refresh" onClick={onRefresh} title="Refresh snapshot" aria-label="Refresh snapshot"><Activity size={dpIconMetric("--dp-icon-size-16")} /></button>
        )}
        <ThemePicker themeId={themeId} mode={mode} onTheme={onTheme} onMode={onMode} />
      </div>
    </header>
  );
}

function MetricCard({ label, value, detail, Icon, tone = "neutral" }: {
  label: string;
  value: string | number;
  detail: string;
  Icon: typeof Network;
  tone?: "neutral" | "danger" | "warning" | "success";
}): JSX.Element {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__top"><span>{label}</span><Icon size={dpIconMetric("--dp-icon-size-16")} strokeWidth={dpIconMetric("--dp-icon-stroke-regular")} /></div>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__detail">{detail}</div>
    </article>
  );
}

function Overview({ feed, model, now }: {
  feed: FeedState;
  model: ReturnType<typeof buildMapModel>;
  now: number;
}): JSX.Element {
  const snapshot = feed.snapshot;
  const active = snapshot?.items.filter((item) => item.stage === "claimed" || item.stage === "running").length ?? 0;
  const blocked = snapshot?.items.filter((item) => item.stage === "blocked" || item.blockers.length > 0).length ?? 0;
  const review = snapshot?.items.filter((item) => item.stage === "qa" || item.stage === "guard").length ?? 0;
  const freshness = feed.source === "fixture" ? null : snapshotFreshness(snapshot, feed.receivedAt, now, feed.lastFailure);
  const queueTotal = snapshot === null ? "—" : snapshot.items.length;
  return (
    <section className="overview-grid" aria-label="System summary">
      <MetricCard label="Graph modules" value={model.nodes.length || "—"} detail={model.source === "graph" ? "generic architecture graph" : "plan nodes returned"} Icon={Waypoints} />
      <MetricCard label="In progress" value={snapshot === null ? "—" : active} detail={snapshot === null ? "waiting for source" : `${review} at review gates`} Icon={Activity} tone={active > 0 ? "warning" : "neutral"} />
      <MetricCard label="Blocked" value={snapshot === null ? "—" : blocked} detail={blocked > 0 ? "work items report blockers" : snapshot === null ? "not observed" : "none reported"} Icon={ShieldAlert} tone={blocked > 0 ? "danger" : "neutral"} />
      <MetricCard label="Work items" value={queueTotal} detail={freshness?.label ?? "fixture has no live status"} Icon={Clock3} tone={freshness?.stale ? "warning" : "neutral"} />
    </section>
  );
}

function SignalLegend(): JSX.Element {
  return (
    <div className="map-key" aria-label="Map key">
      <span><i className="signal-dot signal-dot--danger" />Blocker</span>
      <span><i className="signal-dot signal-dot--warning" />Review</span>
      <span><i className="signal-dot signal-dot--info" />In progress</span>
      <span><i className="signal-dot signal-dot--success" />Delivered</span>
      <span><i className="signal-dot signal-dot--muted" />Unobserved</span>
    </div>
  );
}

function MapControls({ stacked, circuit, onStack, onCircuit, canTrace, onTrace }: {
  stacked: boolean;
  circuit: boolean;
  onStack: () => void;
  onCircuit: () => void;
  canTrace: boolean;
  onTrace: () => void;
}): JSX.Element {
  return (
    <div className="map-tools" role="group" aria-label="Topology view options">
      <button type="button" className={stacked ? "tool-button is-active" : "tool-button"} onClick={onStack} aria-pressed={stacked}><Layers3 size={dpIconMetric("--dp-icon-size-15")} /> Stack</button>
      <button type="button" className={circuit ? "tool-button is-active" : "tool-button"} onClick={onCircuit} aria-pressed={circuit}><Orbit size={dpIconMetric("--dp-icon-size-15")} /> Circuit</button>
      {canTrace && <button type="button" className="tool-button" onClick={onTrace}><Activity size={dpIconMetric("--dp-icon-size-15")} /> Trace story</button>}
    </div>
  );
}

function SourceBar({ feed, now }: { feed: FeedState; now: number }): JSX.Element {
  const snapshot = feed.snapshot;
  if (feed.source === "fixture") return (
    <div className="source-bar source-bar--preview" role="note">
      <span className="source-bar__mark"><CircleHelp size={dpIconMetric("--dp-icon-size-15")} /></span>
      <span><strong>Illustrative preview</strong> · static module sample; no live repository, seat activity, runtime, or review result is represented.</span>
      <a href="/" className="source-bar__action">Connect source <ArrowUpRight size={dpIconMetric("--dp-icon-size-14")} /></a>
    </div>
  );
  if (snapshot === null) return (
    <div className="source-bar source-bar--empty" role="status">
      <span className="source-bar__mark"><Network size={dpIconMetric("--dp-icon-size-15")} /></span>
      <span><strong>Waiting for a snapshot</strong> · start the Rust server on <code>127.0.0.1:4185</code>, or open a static export that embeds one.</span>
    </div>
  );
  const freshness = snapshotFreshness(snapshot, feed.receivedAt, now, feed.lastFailure);
  return (
    <div className={`source-bar ${freshness.stale ? "source-bar--stale" : ""}`} role={freshness.stale ? "alert" : "note"}>
      <span className="source-bar__mark">{freshness.stale ? <Clock3 size={dpIconMetric("--dp-icon-size-15")} /> : <Activity size={dpIconMetric("--dp-icon-size-15")} />}</span>
      <span>
        <strong>{feed.source === "embedded" ? "Frozen export" : "Snapshot source"}</strong>
        <span className="source-bar__sep">·</span>{freshness.label}
        <span className="source-bar__sep">·</span>collected {formatTime(snapshot.collected_at)}
        {feed.lastFailure !== null && <span className="source-bar__error"> · Last refresh failed: {feed.lastFailure}</span>}
      </span>
      <span className="source-bar__digest">sha256 {shortHash(snapshot.content_sha256)}</span>
    </div>
  );
}

function Inspector({ node, model, feed, onClose }: {
  node: MapNode | undefined;
  model: ReturnType<typeof buildMapModel>;
  feed: FeedState;
  onClose: () => void;
}): JSX.Element {
  if (node === undefined) return (
    <aside className="inspector inspector--empty" aria-label="Module inspector">
      <div className="inspector-empty__ornament" aria-hidden="true"><Waypoints size={dpIconMetric("--dp-icon-size-28")} strokeWidth={dpIconMetric("--dp-icon-stroke-fine")} /></div>
      <p className="eyebrow">INSPECTOR</p>
      <h2>Choose a module</h2>
      <p>Select a form on the map or a row in the table to inspect its status, dependencies, and source evidence.</p>
      <div className="inspector-empty__hint"><kbd>Tab</kbd> through modules <span>·</span> <kbd>Enter</kbd> to inspect</div>
    </aside>
  );
  const item = node.item;
  const head = exactHeadVerdict(item);
  const neighbors = model.edges.filter((edge) => edge.from === node.id || edge.to === node.id);
  const history = item?.history ?? [];
  return (
    <aside className="inspector" aria-label={`${node.title} module inspector`}>
      <div className="inspector__topline"><span>MODULE INSPECTOR</span><button type="button" onClick={onClose} className="inspector__close" aria-label="Clear selected module">×</button></div>
      <div className="inspector__identity">
        <span className="inspector__tag">{node.tag}</span>
        <h2>{node.title}</h2>
        <p>{node.groupLabel}</p>
      </div>
      <div className="inspector__state">
        <span className={stageClass(node.stage)}><i />{node.stage.replaceAll("_", " ")}</span>
        {node.criticalPath && <span className="critical-chip">Critical path</span>}
      </div>
      {node.description.length > 0 && <p className="inspector__description">{node.description}</p>}
      <div className="inspector__rule" />
      <div className="inspector__section-title"><span>HEAD VERDICT</span><span className={`verdict verdict--${head.tone}`}>{head.label}</span></div>
      <p className="inspector__mono">{head.detail}</p>
      {item?.head_sha && head.label === "Pass" && <p className="inspector__fine">Pass recorded against this exact head.</p>}
      {item?.head_sha && head.label === "No pass" && <p className="inspector__fine">No passing result is recorded for this exact head.</p>}
      {item?.blockers.length ? (
        <div className="blocker-note"><ShieldAlert size={dpIconMetric("--dp-icon-size-15")} /><span>{item.blockers.join(" · ")}</span></div>
      ) : null}
      <div className="inspector__rule" />
      <div className="inspector__section-title"><span>CONNECTIONS</span><span className="count-badge">{neighbors.length}</span></div>
      {neighbors.length > 0 ? (
        <ul className="connection-list">
          {neighbors.slice(0, 6).map((edge) => {
            const related = model.nodes.find((entry) => entry.id === (edge.from === node.id ? edge.to : edge.from));
            return <li key={edge.id}><span className="connection-list__kind">{edge.kind}</span><span>{related?.title ?? (edge.from === node.id ? edge.to : edge.from)}</span><span className="connection-list__arrow">{edge.from === node.id ? "→" : "←"}</span></li>;
          })}
        </ul>
      ) : <p className="inspector__fine">No graph connections were returned.</p>}
      {node.sourceRefs.length > 0 && (
        <>
          <div className="inspector__rule" />
          <div className="inspector__section-title"><span>SOURCES</span></div>
          <ul className="source-list">
            {node.sourceRefs.map((source) => source.startsWith("http")
              ? <li key={source}><a href={source} target="_blank" rel="noreferrer">Open source <ExternalLink size={dpIconMetric("--dp-icon-size-12")} /></a></li>
              : <li key={source}><code>{source}</code></li>)}
          </ul>
        </>
      )}
      {history.length > 0 && (
        <>
          <div className="inspector__rule" />
          <div className="inspector__section-title"><span>HISTORY</span><span className="count-badge">{history.length}</span></div>
          <ol className="history-list">
            {history.slice(0, 3).map((event) => (
              <li key={event.id}>
                <span className="history-list__bullet" />
                <span className="history-list__body"><b>{event.kind}</b><time dateTime={event.at}>{formatTime(event.at)}</time><small>sha256 {shortHash(event.sha256)}</small>
                  <a href={event.source_url} target="_blank" rel="noreferrer">View evidence <ExternalLink size={dpIconMetric("--dp-icon-size-10")} /></a>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      {item !== undefined && (
        <>
          <div className="inspector__rule" />
          <div className="inspector__section-title"><span>NEXT ACTION</span></div>
          <p className="inspector__next-action">{item.next_action || "No next action was returned."}</p>
          <div className="inspector__fine">Current runtime: {displayStatus(feed.snapshot?.native_runtime_status)}</div>
        </>
      )}
    </aside>
  );
}

function MapTable({ model, selectedId, onSelect }: {
  model: ReturnType<typeof buildMapModel>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  const nodes = [...model.nodes].sort((left, right) => Number(right.criticalPath) - Number(left.criticalPath) || left.title.localeCompare(right.title));
  return (
    <section className="data-panel" aria-labelledby="map-table-title">
      <div className="data-panel__header">
        <div><p className="eyebrow">ACCESSIBLE MAP INDEX</p><h2 id="map-table-title">Modules and connections</h2></div>
        <span className="data-panel__meta">{nodes.length} modules · {model.edges.length} connections</span>
      </div>
      {nodes.length === 0 ? (
        <div className="empty-table"><Waypoints size={dpIconMetric("--dp-icon-size-18")} /> No modules are present in this snapshot.</div>
      ) : (
        <div className="table-scroll" role="region" aria-label="Modules and connections table" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Module</th><th scope="col">Stage</th><th scope="col">Critical path</th><th scope="col">Links</th><th scope="col">Head</th><th scope="col">Source</th></tr></thead>
            <tbody>
              {nodes.map((node) => {
                const head = exactHeadVerdict(node.item);
                const linkCount = model.edges.filter((edge) => edge.from === node.id || edge.to === node.id).length;
                return (
                  <tr key={node.id} className={selectedId === node.id ? "is-selected" : ""}>
                    <th scope="row"><button className="module-table__select" type="button" onClick={() => onSelect(node.id)} aria-pressed={selectedId === node.id}><span className="module-table__symbol">{node.tag.slice(0, 2)}</span><span><b>{node.title}</b><small>{node.groupLabel}</small></span></button></th>
                    <td><span className={stageClass(node.stage)}><i />{node.stage}</span></td>
                    <td>{node.criticalPath ? <span className="critical-chip">Critical</span> : <span className="table-dash">—</span>}</td>
                    <td className="table-number">{linkCount}</td>
                    <td><span className={`verdict verdict--${head.tone}`}>{head.label}</span><small className="table-head">{head.detail}</small></td>
                    <td>{node.sourceRefs.length > 0 ? node.sourceRefs.map((source) => source.startsWith("http") ? <a className="table-link" key={source} href={source} target="_blank" rel="noreferrer" aria-label={`Open source for ${node.title}`}><ExternalLink size={dpIconMetric("--dp-icon-size-14")} /></a> : <code className="table-ref" key={source}>{source}</code>) : <span className="table-dash">Unlinked</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function QueueView({ feed, now, search, setSearch, onSelect }: {
  feed: FeedState;
  now: number;
  search: string;
  setSearch: (value: string) => void;
  onSelect: (id: string) => void;
}): JSX.Element {
  const items = feed.snapshot?.items ?? [];
  const filtered = items
    .filter((item) => `${item.title} ${item.unit ?? ""} ${item.category} ${item.stage} ${item.labels.join(" ")}`.toLowerCase().includes(search.toLowerCase()))
    .sort((left, right) => stageOrder.indexOf(left.stage) - stageOrder.indexOf(right.stage) || (right.stage_age_seconds ?? -1) - (left.stage_age_seconds ?? -1));
  return (
    <section className="workspace-view" aria-labelledby="queue-heading">
      <div className="workspace-view__intro"><p className="eyebrow">PLAN · WORK ITEMS</p><h1 id="queue-heading">Work queue</h1><p>Queue stage and age are shown from the latest snapshot. Unknown ages stay unknown.</p></div>
      <div className="queue-toolbar"><label className="search-field"><Search size={dpIconMetric("--dp-icon-size-16")} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter by title, slice, or stage" aria-label="Filter work items" /><kbd>/</kbd></label><span>{filtered.length} of {items.length} items</span></div>
      {feed.snapshot?.queues && Object.keys(feed.snapshot.queues).length > 0 && (
        <div className="queue-counts" aria-label="Source queue counts">
          {Object.entries(feed.snapshot.queues).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => <div className="queue-count" key={key}><span>{key.replaceAll("_", " ")}</span><b>{value}</b></div>)}
        </div>
      )}
      {filtered.length === 0 ? <div className="empty-state"><ListFilter size={dpIconMetric("--dp-icon-size-18")} /><h2>{items.length === 0 ? "No work items returned" : "No items match this filter"}</h2><p>{items.length === 0 ? "Connect a snapshot source to show issues, pull requests, and their history." : "Clear the search to see the full queue."}</p></div> : (
        <div className="queue-list">
          {filtered.map((item) => {
            const head = exactHeadVerdict(item);
            return (
              <article className="queue-row" key={`${item.kind}-${item.number}`}>
                <div className="queue-row__main"><span className="queue-row__type">{item.kind} · #{item.number}</span><h2>{item.title}</h2><p>{item.unit || item.category || "Uncategorized"}{item.blockers.length > 0 ? ` · ${item.blockers.join(" · ")}` : ""}</p></div>
                <div className="queue-row__stage"><span className={stageClass(item.stage)}><i />{item.stage}</span><span className="queue-row__age"><Clock3 size={dpIconMetric("--dp-icon-size-13")} />{ageFor(item, now)}</span></div>
                <div className="queue-row__proof"><span className={`verdict verdict--${head.tone}`}>{head.label}</span><small>{head.detail}</small></div>
                <div className="queue-row__actions"><a href={item.url || undefined} aria-disabled={item.url.length === 0} target={item.url ? "_blank" : undefined} rel={item.url ? "noreferrer" : undefined} aria-label={`Open ${item.title} source`}><ExternalLink size={dpIconMetric("--dp-icon-size-15")} /></a><button type="button" onClick={() => onSelect(item.unit ?? `#${item.number}`)} aria-label={`Inspect ${item.title}`}><ArrowUpRight size={dpIconMetric("--dp-icon-size-15")} /></button></div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EvidenceView({ feed }: { feed: FeedState }): JSX.Element {
  const items = feed.snapshot?.items ?? [];
  const events = items.flatMap((item) => item.history.map((event) => ({ item, event })))
    .sort((a, b) => Date.parse(b.event.at) - Date.parse(a.event.at));
  return (
    <section className="workspace-view" aria-labelledby="evidence-heading">
      <div className="workspace-view__intro"><p className="eyebrow">PROVENANCE · SOURCE TRAIL</p><h1 id="evidence-heading">Evidence history</h1><p>Source URLs, source hashes, edit times, and head checks are preserved as returned by the collector.</p></div>
      <div className="evidence-summary">
        <div><span>Evidence records</span><b>{feed.snapshot === null ? "—" : events.length}</b></div>
        <div><span>Observed endpoints</span><b>{feed.snapshot === null ? "—" : feed.snapshot.coverage.length}</b></div>
        <div><span>Snapshot age</span><b>{feed.snapshot === null ? "—" : feed.source === "fixture" ? "Preview" : snapshotFreshness(feed.snapshot, feed.receivedAt, Date.now(), feed.lastFailure).label}</b></div>
      </div>
      {events.length === 0 ? <div className="empty-state"><FileClock size={dpIconMetric("--dp-icon-size-18")} /><h2>No evidence history returned</h2><p>Source links appear here when the snapshot contains append-only evidence records.</p></div> : (
        <div className="evidence-list">
          {events.map(({ item, event }) => (
            <article className="evidence-row" key={`${item.number}-${event.id}`}>
              <div className="evidence-row__timeline"><span /></div>
              <div className="evidence-row__body"><span className="evidence-row__kind">{event.kind} · {item.kind} #{item.number}</span><h2>{item.title}</h2><p>{event.body || "No evidence text supplied."}</p><div className="evidence-row__meta"><span><Clock3 size={dpIconMetric("--dp-icon-size-12")} />{formatTime(event.at)}</span><span>Edited {formatTime(event.edited_at)}</span><code>sha256 {event.sha256 || "unknown"}</code></div></div>
              <a className="evidence-row__source" href={event.source_url} target="_blank" rel="noreferrer">Open source <ExternalLink size={dpIconMetric("--dp-icon-size-13")} /></a>
            </article>
          ))}
        </div>
      )}
      {feed.snapshot !== null && (
        <section className="coverage-panel" aria-labelledby="coverage-heading">
          <div className="data-panel__header"><div><p className="eyebrow">COLLECTOR COVERAGE</p><h2 id="coverage-heading">Source endpoints</h2></div><span className="data-panel__meta">{feed.snapshot.coverage.length} returned</span></div>
          {feed.snapshot.coverage.length === 0 ? <p className="coverage-panel__empty">No coverage records were returned.</p> : feed.snapshot.coverage.map((source) => <div className="coverage-row" key={`${source.endpoint}-${source.sha256}`}><code>{source.endpoint}</code><span>{source.pages} pages</span><span>{source.count} records</span><code className="coverage-row__hash">sha256 {shortHash(source.sha256)}</code></div>)}
        </section>
      )}
    </section>
  );
}

function RuntimeRow({ feed }: { feed: FeedState }): JSX.Element {
  const snapshot = feed.snapshot;
  return (
    <section className="runtime-strip" aria-label="Runtime and usage evidence">
      <div className="runtime-strip__lead"><Activity size={dpIconMetric("--dp-icon-size-15")} /><span>Observed surfaces</span></div>
      <div className="runtime-item"><span>Native runtime</span><b>{snapshot === null || feed.source === "fixture" ? "Unknown" : displayStatus(snapshot.native_runtime_status)}</b></div>
      <div className="runtime-item"><span>Token cost</span><b>{snapshot === null || feed.source === "fixture" ? "Unknown" : displayStatus(snapshot.token_cost_status)}</b></div>
      <div className="runtime-item"><span>Coverage records</span><b>{snapshot === null || feed.source === "fixture" ? "Unknown" : snapshot.coverage.length}</b></div>
      {feed.graphFailure !== null && <div className="runtime-item runtime-item--warning"><span>Graph API</span><b>Unavailable · plan view shown</b></div>}
    </section>
  );
}

function LoadingState({ message }: { message: string | null }): JSX.Element {
  return (
    <div className="loading-panel" role="status" aria-live="polite">
      <div className="loading-panel__orb" aria-hidden="true"><Waypoints size={dpIconMetric("--dp-icon-size-24")} /></div>
      <p className="eyebrow">ISOSCOPE · SNAPSHOT</p>
      <h2>{message === null ? "Listening for a source" : "Source not available"}</h2>
      <p>{message ?? "The map will appear as soon as the local server returns a snapshot."}</p>
      <code>GET /api/snapshot · 127.0.0.1:4185</code>
    </div>
  );
}

export function App({ initialTheme }: { initialTheme: { themeId: string; mode: ColorMode } }): JSX.Element {
  const [feed, setFeed] = useState<FeedState>(() => bootstrapFeed());
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const [view, setView] = useState<View>("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stacked, setStacked] = useState(false);
  const [circuit, setCircuit] = useState(false);
  const [traceIndex, setTraceIndex] = useState(-1);
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState("");
  const [themeId, setThemeId] = useState(initialTheme.themeId);
  const [mode, setMode] = useState<ColorMode>(initialTheme.mode);
  const [manualRefresh, setManualRefresh] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const preview = feed.source === "fixture";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (feed.source === "embedded" || feed.source === "fixture") return;
    return startPolling(
      () => feedRef.current,
      (next) => setFeed(next),
      30_000,
    );
  }, [feed.source]);

  const snapshot = feed.snapshot;
  const model = useMemo(() => snapshot === null
    ? { title: "", groups: [], nodes: [], edges: [], trace: [], traceText: {}, source: "plan" as const }
    : buildMapModel(snapshot, feed.graph), [snapshot, feed.graph]);
  const selected = model.nodes.find((node) => node.id === selectedId);
  const visibleWorkItems = snapshot?.items ?? [];
  const currentTraceEdge = traceIndex >= 0 && model.trace.length > 0 ? model.trace[traceIndex % model.trace.length] ?? null : null;

  const chooseTheme = (id: string): void => {
    const safeId = themeInventory.some((theme) => theme.id === id) ? id : "desert";
    setThemeId(safeId);
    applyTheme(safeId, mode);
  };
  const chooseMode = (next: ColorMode): void => {
    setMode(next);
    applyTheme(themeId, next);
  };
  const manualRefreshNow = async (): Promise<void> => {
    setManualRefresh(true);
    try {
      const next = await refreshFeed(feedRef.current);
      setFeed(next);
    } finally {
      setManualRefresh(false);
    }
  };
  const selectWorkItem = (itemId: string): void => {
    setView("map");
    setSelectedId(itemId);
    const node = model.nodes.find((entry) => entry.id === itemId);
    if (node === undefined) {
      const linked = model.nodes.find((entry) => entry.item?.unit === itemId);
      if (linked !== undefined) setSelectedId(linked.id);
    }
  };
  const tabNav = (next: View): void => {
    setView(next);
    mainRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="app-shell">
      <SideRail view={view} onView={tabNav} repository={snapshot?.repository ?? "Isoscope"} />
      <main className="app-main" ref={mainRef} tabIndex={-1}>
        <Header feed={feed} themeId={themeId} mode={mode} onTheme={chooseTheme} onMode={chooseMode} onRefresh={() => void manualRefreshNow()} now={now} />
        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">INSPECTABLE SYSTEMS <span className="eyebrow__line" /></p>
              <h1>{view === "map" ? "System map" : view === "queue" ? "Work queue" : "Evidence history"}</h1>
              <p className="page-heading__lede">{view === "map" ? "Architecture, dependencies, and observed delivery state in one view." : view === "queue" ? "Current stage, age, and head evidence for each returned work item." : "Trace each recorded state to its source and content hash."}</p>
            </div>
            <div className="page-heading__right">
              <span className={`source-badge source-badge--${feed.source}`}><i />{preview ? "Preview" : feed.source === "embedded" ? "Static export" : feed.source === "api" ? "Live source" : "Connecting"}</span>
              <span className="page-heading__schema">{snapshot?.schema ?? "Snapshot pending"}</span>
            </div>
          </div>
          {snapshot !== null && <Overview feed={feed} model={model} now={now} />}
          <SourceBar feed={feed} now={now} />
          {snapshot === null && feed.loading && <LoadingState message={feed.lastFailure} />}
          {snapshot === null && !feed.loading && <LoadingState message={feed.lastFailure} />}
          {snapshot !== null && view === "map" && (
            <>
              <section className="map-layout" aria-label="System topology and selected module">
                <div className="map-panel">
                  <div className="map-panel__header">
                    <div className="map-panel__title"><span className="map-panel__icon"><Network size={dpIconMetric("--dp-icon-size-18")} /></span><div><h2>Topology</h2><p>{model.source === "graph" ? "Generic Isoscope graph" : "Plan dependencies"}<span>·</span>{model.groups.length} groups</p></div></div>
                    <MapControls stacked={stacked} circuit={circuit} onStack={() => setStacked((value) => !value)} onCircuit={() => setCircuit((value) => !value)} canTrace={model.trace.length > 0} onTrace={() => setTraceIndex((index) => (index + 1) % model.trace.length)} />
                  </div>
                  {feed.graphFailure !== null && <div className="graph-warning" role="status">Graph endpoint unavailable; showing the plan dependency graph. <span>{feed.graphFailure}</span></div>}
                  <div className="topology-frame">
                    {model.nodes.length > 0 ? (
                      <Suspense fallback={<div className="map-loading" role="status">Loading topology renderer…</div>}>
                        <TopologyCanvas model={model} selectedId={selectedId} circuit={circuit} stacked={stacked} traceEdge={currentTraceEdge} onSelect={setSelectedId} onHome={() => setCircuit(false)} />
                      </Suspense>
                    ) : (
                      <div className="map-empty"><Network size={dpIconMetric("--dp-icon-size-24")} /><h3>No graph nodes returned</h3><p>The snapshot is valid, but it does not include plan nodes and no generic graph was imported.</p></div>
                    )}
                  </div>
                  <div className="map-panel__footer"><SignalLegend /><span className="map-controls-hint"><Orbit size={dpIconMetric("--dp-icon-size-13")} /> Drag to orbit <i /> Scroll to zoom</span></div>
                  {currentTraceEdge !== null && <div className="trace-narration" role="status"><span>TRACE {traceIndex + 1}/{model.trace.length}</span>{model.traceText[currentTraceEdge] ?? currentTraceEdge}</div>}
                </div>
                <Inspector node={selected} model={model} feed={feed} onClose={() => setSelectedId(null)} />
              </section>
              <MapTable model={model} selectedId={selectedId} onSelect={setSelectedId} />
            </>
          )}
          {snapshot !== null && view === "queue" && <QueueView feed={feed} now={now} search={search} setSearch={setSearch} onSelect={selectWorkItem} />}
          {snapshot !== null && view === "evidence" && <EvidenceView feed={feed} />}
          <RuntimeRow feed={feed} />
          {snapshot !== null && snapshot.warnings.length > 0 && (
            <details className="warning-drawer"><summary><ShieldAlert size={dpIconMetric("--dp-icon-size-15")} /> Collector notes <span>{snapshot.warnings.length}</span></summary><ul>{snapshot.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></details>
          )}
          <footer className="page-footer"><span>ISOSCOPE <i /> MAP THE SHAPE OF SYSTEMS</span><span>{snapshot === null || preview ? "Source evidence: unknown" : `${visibleWorkItems.length} observed work items`}</span><span className="page-footer__right">{manualRefresh ? "Refreshing…" : feed.source === "embedded" ? "Read only" : "Polls every 30 seconds"}</span></footer>
        </div>
      </main>
    </div>
  );
}
