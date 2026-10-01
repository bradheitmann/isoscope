import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {Line2} from "three/addons/lines/Line2.js";
import {LineMaterial} from "three/addons/lines/LineMaterial.js";
import {LineGeometry} from "three/addons/lines/LineGeometry.js";
import SPEC_SOURCE from "../examples/isoscope.spec.json";
import { themes as DP_THEMES, setTheme as setDPTheme, setMode as setDPMode, type ThemeId, type Mode } from "../vendor/desert-pants/build/web/themes";
import { tokens, type TokenPath } from "../vendor/desert-pants/build/web/tokens";
import { presentedThemes } from "./theme-order";
import { pageNavigation, type NavigationNode } from "./navigation";
import iconPlay from "../vendor/desert-pants/icons/svg/play.svg?raw";
import iconTrace from "../vendor/desert-pants/icons/svg/arrow-right.svg?raw";
import iconDraw from "../vendor/desert-pants/icons/svg/pen.svg?raw";
import iconLayers from "../vendor/desert-pants/icons/svg/layers.svg?raw";
import iconGrid from "../vendor/desert-pants/icons/svg/grid.svg?raw";
import iconSoundOn from "../vendor/desert-pants/icons/svg/volume-2.svg?raw";
import iconSoundOff from "../vendor/desert-pants/icons/svg/volume-x.svg?raw";
import iconStop from "../vendor/desert-pants/icons/svg/stop.svg?raw";
import iconReset from "../vendor/desert-pants/icons/svg/rotate-ccw.svg?raw";
import iconSettings from "../vendor/desert-pants/icons/svg/settings.svg?raw";
import iconOverview from "../vendor/desert-pants/icons/svg/info.svg?raw";
import iconClose from "../vendor/desert-pants/icons/svg/x.svg?raw";
import iconSearch from "../vendor/desert-pants/icons/svg/search.svg?raw";
import iconPlus from "../vendor/desert-pants/icons/svg/plus.svg?raw";
import iconMinus from "../vendor/desert-pants/icons/svg/minus.svg?raw";
import iconChevron from "../vendor/desert-pants/icons/svg/chevron-down.svg?raw";
import { isoRouteAll } from "../../router.mjs";
import { isEditableTarget } from "./editable-target";
import { getModule, type FaceKey, type SurfaceKind, type SurfaceRef } from "./annotations";

type Item = { c: "red" | "amber" | "you" | "info" | string; l: string };
type Group = { id: string; label: string };
type MediaFace = "front" | "roof" | "left" | "right" | "north" | "south" | "east" | "west";
type MediaSpec = { src: string; face?: MediaFace; fit?: "cover" | "contain"; live?: boolean; group?: string; audio?: boolean };
type MapNode = {
  id: string; tag?: string; g: string; name: string; x: number; y: number; w: number; d: number; h: number;
  does?: string; built?: string; refs?: string; good?: string; cond?: string; items: Item[]; st: string;
  media?: MediaSpec | MediaSpec[];   /* one surface, or several (one per face) */
  stack?: number; _lvl: number; _ly: number; _lyT: number; _anchor: THREE.Vector3;
};
type EdgeTuple = [string, string, string?];
type Spec = {
  title: string; brand?: { k: string; v: string }; metrics?: Array<{ k: string; v: string }>;
  wordmark?: string; asOf?: string; intro?: { eyebrow?: string; title?: string; sub?: string; proseHTML?: string };
  groups: Group[]; nodes: MapNode[]; edges: EdgeTuple[]; status?: Record<string, { state?: string; items?: Item[] }>;
  edgeStatus?: Record<string, string>; edgeDocs?: Record<string, { title?: string; carries?: string; refs?: string }>;
  levels?: Record<string, number>; short?: Record<string, string>; trace?: string[]; traceText?: Record<string, string>;
  telemetry?: Record<string, { trace_boundary: string; event_stream?: string; wide_event_keys?: string[]; rationale?: string; installed_by?: string; offered_at?: string; verified_at?: string }>;
};
type EdgeRuntime = {
  key: string; line: Line2; type: string; health: string | null; basePts: THREE.Vector3[]; a: string; b: string;
  dotted: boolean; speed: number; t: number; dots: THREE.Mesh[]; pts: THREE.Vector3[]; L: number[];
  total: number; jn: Array<THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>>;
};
type LabelElement = HTMLElement & { _left?: string; _top?: string; _w?: number; _h?: number };
type LabelEntry = { n: MapNode; lb: LabelElement; lx: number; ly: number; depth: number };
type LabelRect = { x0: number; x1: number; y0: number; y1: number };
type Palette = Record<string, THREE.Color>;
type ThemedMaterial = { m: THREE.Material & { color?: THREE.Color }; get: () => THREE.Color };
type RouteOutput = { routes: Record<string, number[][]>; hops: Record<string, number[][]>; qc: Record<string, unknown> };
const CANONICAL_COLOR_VARS: Partial<Record<TokenPath, string>> = {
 "color.bg.canvas":tokens["color.bg.canvas"].cssVar,
 "color.bg.surface":tokens["color.bg.surface"].cssVar,
 "color.bg.raised":tokens["color.bg.raised"].cssVar,
 "color.text.primary":tokens["color.text.primary"].cssVar,
 "color.text.secondary":tokens["color.text.secondary"].cssVar,
 "color.accent.default":tokens["color.accent.default"].cssVar,
 "color.signal.warning.fill":tokens["color.signal.warning.fill"].cssVar,
 "color.signal.info.fill":tokens["color.signal.info.fill"].cssVar,
 "color.signal.danger.fill":tokens["color.signal.danger.fill"].cssVar
};
function materialsOf(object: THREE.Object3D): THREE.Material[] {
  if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
    return Array.isArray(object.material) ? object.material : [object.material];
  }
  return [];
}

const SPEC = SPEC_SOURCE as unknown as Spec;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required Isoscope element #${id} is missing`);
  return element as T;
};
function setCanonicalIcon(button: HTMLElement, source: string, withClass=true): void {
 const parsed=new DOMParser().parseFromString(source,"image/svg+xml");
 const svg=parsed.documentElement;
 if(svg.localName!=="svg"||svg.namespaceURI!=="http://www.w3.org/2000/svg"||parsed.querySelector("parsererror"))
  throw new Error("Invalid bundled Desert Pants icon asset");
 const tags=new Set(["svg","path","line","polyline","polygon","circle","rect"]);
 const attributes=new Set(["xmlns","viewBox","width","height","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","d","x","y","x1","y1","x2","y2","cx","cy","r","rx"]);
 for(const element of [svg,...Array.from(svg.querySelectorAll("*"))]){
  if(!tags.has(element.localName))throw new Error(`Unsupported element in bundled icon: ${element.localName}`);
  for(const attribute of Array.from(element.attributes))if(!attributes.has(attribute.name))throw new Error(`Unsupported icon attribute ${attribute.name}`);
 }
 const icon=document.importNode(svg,true) as unknown as SVGSVGElement;
 if(withClass)icon.classList.add("dp-icon");icon.setAttribute("aria-hidden","true");icon.setAttribute("focusable","false");
 button.replaceChildren(icon);
}
setCanonicalIcon($<HTMLButtonElement>("btnReset"),iconReset);
setCanonicalIcon($<HTMLButtonElement>("btnFlow"),iconPlay);
setCanonicalIcon($<HTMLButtonElement>("btnTrace"),iconTrace);
setCanonicalIcon($<HTMLButtonElement>("btnDraw"),iconDraw);
setCanonicalIcon($<HTMLButtonElement>("btnStack"),iconLayers);
setCanonicalIcon($<HTMLButtonElement>("btnGrid"),iconGrid);
setCanonicalIcon($<HTMLButtonElement>("btnSound"),iconSoundOff);
setCanonicalIcon($<HTMLButtonElement>("btnSettings"),iconSettings);
setCanonicalIcon($<HTMLButtonElement>("btnReadMap"),iconOverview);
setCanonicalIcon($<HTMLButtonElement>("drawerClose"),iconClose);
setCanonicalIcon($<HTMLButtonElement>("closeReadingPanel"),iconClose);
setCanonicalIcon($<HTMLElement>("moduleSearchIcon"),iconSearch);
setCanonicalIcon($<HTMLElement>("modeChevron"),iconChevron,false);
setCanonicalIcon($<HTMLButtonElement>("zin"),iconPlus);
setCanonicalIcon($<HTMLButtonElement>("zout"),iconMinus);

/* Render a small, explicit subset of graph-supplied prose; style and active content never cross this boundary. */
function setSafe(elm: Element, html: string): void {
  const allowedTags = new Set(["A","B","BR","CODE","DD","DIV","DL","DT","EM","H2","H3","LI","OL","P","SPAN","STRONG","UL"]);
  const allowedClasses = new Set(["dp-type-body-sm","dp-type-body-xs","dp-type-label","dp-type-label-sm","dp-type-code","refs","cond","good","pip","red","amber","you","info","risk","sensor"]);
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`,"text/html");
  const root=parsed.body.firstElementChild;
  if (!root) return;
  const copy=(source: Node): Node => {
    if(source.nodeType===Node.TEXT_NODE)return document.createTextNode(source.textContent ?? "");
    if(!(source instanceof Element))return document.createDocumentFragment();
    if(!allowedTags.has(source.tagName))return document.createTextNode(source.textContent ?? "");
    const target=document.createElement(source.tagName.toLowerCase());
    const classes=[...source.classList].filter(name=>allowedClasses.has(name));
    if(classes.length)target.className=classes.join(" ");
    if(source.tagName==="A"){
      const raw=source.getAttribute("href");
      if(raw){try{const url=new URL(raw,location.href);if(url.protocol==="https:"||url.protocol==="http:"){target.setAttribute("href",url.href);target.setAttribute("rel","noreferrer");}}catch{}}
    }
    for(const child of [...source.childNodes])target.append(copy(child));
    return target;
  };
  const fragment=document.createDocumentFragment();
  for(const child of [...root.childNodes])fragment.append(copy(child));
  elm.replaceChildren(fragment);
}
const RM=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let activeTheme: ThemeId="desert";
let activeMode: Mode="light";
try {
 const savedTheme=localStorage.getItem("isoscope.dp.theme");
 const savedMode=localStorage.getItem("isoscope.dp.mode");
 if(savedTheme&&DP_THEMES.some(t=>t.id===savedTheme))activeTheme=savedTheme as ThemeId;
 if(savedMode==="light"||savedMode==="dark"||savedMode==="system")activeMode=savedMode;
} catch { /* first launch stays canonical Desert light */ }
setDPTheme(activeTheme);setDPMode(activeMode);

/* ————— data (identical content to the 2D edition) ————— */
/* ————— Isoscope spec: everything project-specific lives in this JSON ————— */
document.title=SPEC.title||"Isoscope";
const GROUPS: Group[] = SPEC.groups;
const NODES: MapNode[] = SPEC.nodes;
const STATUS: NonNullable<Spec["status"]> = SPEC.status ?? {};
const EDGES: EdgeTuple[] = SPEC.edges;
const EDGEDOCS: NonNullable<Spec["edgeDocs"]> = SPEC.edgeDocs ?? {};
const TRACE: string[] = SPEC.trace ?? [];
const TRACETEXT: Record<string, string> = SPEC.traceText ?? {};
const byId: Record<string, MapNode> = {};
/* advisory gradient planes live beside the meshes; one per attention face */
const advisoryById: Record<string, THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[]> = {};
/* auto-fit: every spec gets a centered home and a view scaled to its extents */
const _bb=(()=>{let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
 if(!NODES.length)return {x0:-1,x1:1,z0:-1,z1:1};
 NODES.forEach(n=>{x0=Math.min(x0,n.x);x1=Math.max(x1,n.x+n.w);z0=Math.min(z0,n.y);z1=Math.max(z1,n.y+n.d);});
 return {x0,x1,z0,z1};})();
const CENTER={x:(_bb.x0+_bb.x1)/2,z:(_bb.z0+_bb.z1)/2};
let FITSPAN=Math.max(_bb.x1-_bb.x0,_bb.z1-_bb.z0);
/* Palette colors are read from the canonical token stylesheet; the world scene derives its roof tints from these roles. */
function tokenColor(path: TokenPath): THREE.Color {
 const roles: Partial<Record<TokenPath,string>>={
  "color.bg.canvas":"canvas","color.bg.surface":"surface","color.bg.raised":"raised",
  "color.text.primary":"text-primary","color.text.secondary":"text-secondary","color.accent.default":"accent",
  "color.signal.warning.fill":"warning","color.signal.info.fill":"info","color.signal.danger.fill":"danger"
 };
 const role=roles[path];if(!role)throw new Error(`No canvas adapter for canonical color token ${path}`);
 const cssToken=CANONICAL_COLOR_VARS[path];
 if(!cssToken)throw new Error(`Canonical color manifest is missing ${path}`);
 const variable=/^var\((--[a-z0-9-]+)\)$/.exec(cssToken)?.[1];
 if(!variable||!getComputedStyle(document.documentElement).getPropertyValue(variable).trim())
  throw new Error(`Canonical color CSS variable is unresolved for ${path}`);
 const expected=`var(${variable})`;
 const targetSelector=`.dp-color-probe--${role}`;
 const cssValue=(rules: CSSRuleList): string | null=>{
  for(const rule of Array.from(rules)){
   if(rule instanceof CSSStyleRule&&rule.selectorText.split(",").some(s=>s.trim()===targetSelector)){
    const value=rule.style.getPropertyValue("color").trim();if(value)return value;
   }
   if("cssRules" in rule){const value=cssValue((rule as CSSGroupingRule).cssRules);if(value)return value;}
  }
  return null;
 };
 let declared: string | null=null;
 for(const sheet of Array.from(document.styleSheets))try{declared=cssValue(sheet.cssRules);if(declared)break;}catch{}
 if(declared!==expected)throw new Error(`Canvas probe ${role} must bind ${path} through ${expected}; found ${declared ?? "no declaration"}`);
 const probe=document.createElement("span");probe.className=`dp-color-probe dp-color-probe--${role}`;document.body.append(probe);
 const value=getComputedStyle(probe).color;probe.remove();
 if(!value)throw new Error(`Missing canonical color token ${path}`);
 return new THREE.Color(value);
}
function mix(a: THREE.Color,b: THREE.Color,t: number): THREE.Color { return a.clone().lerp(b,t); }
/* Mutable scene palette: every color source is an actual canonical role. */
const COL: Palette = {}, ROOF: Palette = {}, SIDEC: Palette = {}, PLINTH: Palette = {};
function computePalette(): void {
 COL.paper=tokenColor("color.bg.canvas");
 COL.warm=tokenColor("color.bg.surface");
 COL.alt=tokenColor("color.bg.raised");
 COL.fg1=tokenColor("color.text.primary");
 COL.fg2=tokenColor("color.text.secondary");
 COL.accent=tokenColor("color.accent.default");
 COL.caution=tokenColor("color.signal.warning.fill");
 COL.info=tokenColor("color.signal.info.fill");
 COL.risk=tokenColor("color.signal.danger.fill");
 ROOF.ok=COL.paper;
 ROOF.attn=mix(COL.paper,COL.caution,0.30);
 ROOF.build=mix(COL.paper,COL.info,0.30);
 ROOF.blocked=mix(COL.paper,COL.risk,0.30);
 const base=mix(COL.warm,COL.alt,0.55);
 SIDEC.ok=base;SIDEC.attn=mix(COL.paper,COL.caution,0.55);
 SIDEC.build=mix(COL.paper,COL.info,0.55);SIDEC.blocked=mix(COL.paper,COL.risk,0.55);
 PLINTH.red=COL.risk;PLINTH.you=COL.accent;PLINTH.amber=COL.caution;
}
computePalette();
/* ————— advisory gradient language (the art's living signal) —————
   Brand discipline, learned from the tokens: a brand gradient is ONE fill color
   dissolving to transparent at a hand-tuned, non-uniform distance (card-bleed
   holds 3% then is gone by 38%; hero-side fades by 54%). Never a color-to-color
   diagonal band — that reads contrived. So each advisory wash is the fill color
   bleeding off the crown and fading out partway down, and the charm comes from
   the fade being uneven: a per-module seed drifts the direction and reach, and a
   low-frequency mottle keeps the edge from ever being a straight ruled line.
   It moves only while Flow is pressed and the module is energized; deselected
   keeps a lighter veil. No neon. */
const ADVISORY_FILL: Record<string, { wash: string; deep: string }> = {
 red:   { wash: "--dp-color-fill-clay-red-bg",  deep: "--dp-color-signal-danger-text" },
 amber: { wash: "--dp-color-fill-terracotta-bg", deep: "--dp-color-signal-warning-text" },
 you:   { wash: "--dp-color-fill-dark-teal-bg",  deep: "--dp-color-accent-default" }
};
function probeVar(variable: string): THREE.Color {
 const probe=document.createElement("span");
 probe.className="dp-color-probe";probe.style.color=`var(${variable})`;document.body.append(probe);
 const value=getComputedStyle(probe).color;probe.remove();
 if(!value||!/\d/.test(value))throw new Error(`Advisory gradient token unresolved: ${variable}`);
 return new THREE.Color(value);
}
const ADVISORY: Record<string, { wash: THREE.Color; deep: THREE.Color }> = {}; /* per-category, rebuilt on theme */
function computeAdvisory(): void {
 for(const [cat,f] of Object.entries(ADVISORY_FILL)) ADVISORY[cat]={wash:probeVar(f.wash),deep:probeVar(f.deep)};
}
computeAdvisory();
/* a stable per-module seed so every face bleeds a little differently, forever */
function seedOf(id: string): number {
 let h=2166136261;for(let i=0;i<id.length;i++){h^=id.charCodeAt(i);h=Math.imul(h,16777619);}
 return ((h>>>0)%1000)/1000;
}
const themed: ThemedMaterial[] = []; /* Original scene materials repaint from live theme tokens. */
const hatched: Array<{ m: THREE.MeshBasicMaterial; st: string }> = [];
function hatchColors(st: string){
 const sig=st==="attn"?COL.caution:st==="build"?COL.info:st==="blocked"?COL.risk:null;
 return {paper:sig?mix(COL.paper,sig,0.20):COL.paper,
         ink:sig?mix(sig,COL.fg1,0.30):mix(COL.fg1,COL.paper,0.15)};
}
function makeHatch(st: string): THREE.CanvasTexture {
 const c=hatchColors(st);
 const cv=document.createElement("canvas");cv.width=cv.height=64;
 const g=cv.getContext("2d");
 if (!g) throw new Error("Canvas 2D context is unavailable");
 g.fillStyle="#"+c.paper.getHexString();g.fillRect(0,0,64,64);
 g.strokeStyle="#"+c.ink.getHexString();
 g.lineWidth=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dp-component-scene-edge-casing"));
 g.beginPath();
 for(let i=-64;i<128;i+=7){g.moveTo(i,64);g.lineTo(i+64,0);}
 g.stroke();
 const t=new THREE.CanvasTexture(cv);
 t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2.5,1.6);
 t.colorSpace=THREE.SRGBColorSpace;
 return t;
}

/* ————— scene ————— */
const wrap=$<HTMLDivElement>("canvasWrap");
const canvas=$<HTMLCanvasElement>("gl");
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
const scene=new THREE.Scene();
scene.background=COL.paper.clone();
/* orthographic projection: no vanishing point — a building is the same size on
   screen near or far; orbiting slides things behind/above each other (flat iso) */
let VIEW=Math.max(16,FITSPAN*1.25+3); /* auto-fit: world units visible at zoom 1 */
const camera=new THREE.OrthographicCamera(-VIEW/2,VIEW/2,VIEW/2,-VIEW/2,-200,500);
const ambient=new THREE.AmbientLight(COL.paper,0.85);scene.add(ambient);
const sun=new THREE.DirectionalLight(COL.paper,0.9);sun.position.set(18,30,10);scene.add(sun);
const fill=new THREE.DirectionalLight(COL.paper,0.25);fill.position.set(-14,12,-16);scene.add(fill);

/* ground grid — OKOA hairline field (rebuilt on theme switch) */
const LVL_H=2.8;let stacked=false;let rebuildDotsAfterLevelMotion=false;let brushReliftPending=false; /* declared before makeGrid runs at setup */
let grids: THREE.GridHelper[] = [];
function makeGrid(){
 grids.forEach(g=>{scene.remove(g);g.geometry.dispose();g.material.dispose();});grids=[];
 const gridC=mix(COL.paper,COL.fg1,0.20);
 /* stacked: three aligned planes — one grid seen from directly above.
    Off-ground planes are fainter with the barest hue shift (noise discipline). */
 const defs=stacked?[
  {y:LVL_H,c:mix(gridC,COL.info,0.10),op:0.38},
  {y:0,c:gridC,op:0.7},
  {y:-LVL_H,c:mix(gridC,COL.caution,0.10),op:0.38}
 ]:[{y:0,c:gridC,op:0.7}];
 defs.forEach(d=>{
  const g=new THREE.GridHelper(80,40,d.c,d.c);
  g.material.transparent=true;g.material.opacity=d.op;
  g.position.set(CENTER.x,d.y-0.01,CENTER.z);scene.add(g);grids.push(g);
 });
}
makeGrid();


/* nodes: pure status roofs (Bass), severity in the FOUNDATION (Tufte — ink the
   object already owns), counts as typography in the labels (Vignelli). */
const SHORT=SPEC.short||{};
const pickables: THREE.Object3D[] = [];
const meshById: Record<string, THREE.Group> = {};
const edgeLinesById: Record<string, EdgeRuntime> = {};
const lblLayer=$<HTMLDivElement>("labels");
function worstOf(n: MapNode): string | null {
 if(!n.items||!n.items.length)return null;
 if(n.items.some(i=>i.c==="red"))return "red";
 if(n.items.some(i=>i.c==="you"))return "you";
 return "amber";
}
/* ————— advisory gradient planes: a masked band on the front face ————— */
const ADVISORY_VERT=`
 varying vec2 vUv;
 void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;
/* Mist rising off the base of each module. Not a wrapped phase (that snaps);
   an fbm fog field scrolled slowly upward and billowed, so the motion is a
   sampled continuum — it never resets, it just keeps drifting. The fog pools at
   the foot, thins with height, and is lit by the category color with a warm-lit
   crest and a cooler shadowed floor (value + saturation shift, the way light
   actually moves through vapor). A per-module seed offsets the noise domain so
   no two objects ever share a shape. Deselected keeps a low, thin veil. */
const ADVISORY_FRAG=`
 uniform vec3 uColors[3]; uniform int uCount;
 uniform float uTime; uniform float uMotion; uniform float uVeil; uniform float uSeed;
 varying vec2 vUv;
 float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
 float vnoise(vec2 p){
  vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),
             mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);
 }
 float fbm(vec2 p){
  float v=0.0,a=0.5;
  for(int k=0;k<4;k++){ v+=a*vnoise(p); p=p*2.03+vec2(11.3,7.7); a*=0.5; }
  return v;
 }
 void main(){
  /* fog domain: per-module offset, stretched horizontally so billows are broad */
  vec2 q=vec2(vUv.x*2.2+uSeed*17.0, vUv.y*2.6-uSeed*9.0);
  float t=uTime*(0.05+0.03*uSeed)*uMotion;      /* slow drift; still unless flowing */
  q.y-=t*3.0;                                    /* the rise: fog lifts off the base */
  /* domain-warped fbm = billowing vapor, not banding */
  float w=fbm(q+vec2(fbm(q+t), fbm(q-t))*0.6);
  /* the color fills the WHOLE face: density modulates the wash, not its extent.
     Only a whisper of pooling toward the foot; coverage runs edge to edge. */
  float pool=1.0-0.28*smoothstep(0.55,1.0,vUv.y);  /* slightly denser low, never empty high */
  float density=clamp(w*0.9+0.28,0.0,1.0)*pool;
  /* a thin feather only at the extreme edges so it keys onto the face cleanly */
  float edge=smoothstep(0.0,0.03,vUv.x)*smoothstep(1.0,0.97,vUv.x)
            *smoothstep(0.0,0.03,vUv.y)*smoothstep(1.0,0.97,vUv.y);
  density*=0.35+0.65*edge;
  /* extradimensionality without touching the geometry: derive a pseudo-normal from
     the fog's own density gradient and light it, so the vapor reads as a volume
     with a lit ridge and a shadowed lee — depth from shading, not from a mesh */
  float e=0.012;
  float wX=fbm(q+vec2(e,0.0)+vec2(fbm(q+vec2(e,0.0)+t),fbm(q+vec2(e,0.0)-t))*0.6);
  float wY=fbm(q+vec2(0.0,e)+vec2(fbm(q+vec2(0.0,e)+t),fbm(q+vec2(0.0,e)-t))*0.6);
  vec2 grad=vec2(wX-w,wY-w)/e;
  vec3 nrm=normalize(vec3(-grad*0.9,1.0));
  vec3 lightDir=normalize(vec3(0.4,0.75,0.6));
  float shade=clamp(dot(nrm,lightDir),0.0,1.0);
  /* color: category fill, warmed toward the light where the fog is thickest,
     cooled toward the paper where it thins — light moving through vapor */
  vec3 base=uColors[0];
  vec3 deep=(uCount>1)?uColors[1]:base;
  vec3 col=mix(deep,base,clamp(density*1.3,0.0,1.0));
  float lit=pow(density,1.6);
  col=mix(col,col*1.18+vec3(0.04),lit);          /* crest catches light */
  col*=(0.66+0.5*shade);                          /* volumetric self-shadow/highlight */
  /* coverage floor: the wash is always present across the face; density deepens it */
  float alpha=(0.34+0.6*density)*mix(1.0,0.42,uVeil);
  gl_FragColor=vec4(col,alpha);
 }
`;
function advisoryPlane(n: MapNode,cats: string[]): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null {
 const present=cats.filter(c=>ADVISORY[c]);
 if(!present.length)return null;
 const cols: THREE.Color[]=[];
 present.forEach(c=>{cols.push(ADVISORY[c].wash);});
 present.forEach(c=>{cols.push(ADVISORY[c].deep);});
 const uColors=[cols[0],cols[1]??cols[0],cols[2]??cols[cols.length-1]??cols[0]];
 const mat=new THREE.ShaderMaterial({
  vertexShader:ADVISORY_VERT,fragmentShader:ADVISORY_FRAG,transparent:true,depthWrite:false,
  uniforms:{uColors:{value:uColors},uCount:{value:Math.min(3,cols.length)},uTime:{value:seedOf(n.id)*7.3},uMotion:{value:0},uVeil:{value:0},uSeed:{value:seedOf(n.id)}}
 });
 const h=Math.max(n.h,0.6);
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(n.w,h),mat);
 plane.position.set(n.x+n.w/2,h/2+0.02,n.y+n.d+0.012);
 plane.userData.advisoryCats=present;
 return plane;
}
function refreshAdvisory(n: MapNode): void {
 const cats=Array.from(new Set((n.items||[]).map(i=>i.c).filter(c=>ADVISORY_FILL[c])));
 const old=advisoryById[n.id]||[];
 old.forEach(p=>{const par=p.parent;if(par)par.remove(p);p.geometry.dispose();p.material.dispose();});
 advisoryById[n.id]=[];
 const plane=advisoryPlane(n,cats);
 if(plane){meshById[n.id].add(plane);advisoryById[n.id]=[plane];}
}

/* ————— per-face surfaces: any module face can carry a live surface —————
   A module's five faces (roof + four walls) each accept a SurfaceRef: the spec's
   `media` field declares one, and the annotation store can put a surface on any
   face (annotations override spec per face). Video and image render fully here;
   mist reuses the advisory shader on the assigned face; doc/slides/ink get a
   placeholder plane this slice. Surfaces dim with the circuit, honor reduced-
   motion (video holds its first frame unless live), and dispose with the scene. */
type SurfaceEntry={ plane: THREE.Mesh; dispose: () => void; video?: HTMLVideoElement; kind: SurfaceKind; moduleId: string; group?: string; audio?: boolean };
const surfacesById: Record<string, Partial<Record<FaceKey, SurfaceEntry>>> = {};
/* face → world placement: a plane floated just proud of that face */
function facePlane(n: MapNode,face: FaceKey,mat: THREE.Material): THREE.Mesh<THREE.PlaneGeometry, THREE.Material> {
 const h=Math.max(n.h,0.6),proud=0.016;
 const px=n.x+n.w/2,pz=n.y+n.d/2;
 let m: THREE.Mesh<THREE.PlaneGeometry, THREE.Material>;
 if(face==="roof"){m=new THREE.Mesh(new THREE.PlaneGeometry(n.w,n.d),mat);m.rotation.x=-Math.PI/2;m.position.set(px,h+proud,pz);}
 else if(face==="bottom"){m=new THREE.Mesh(new THREE.PlaneGeometry(n.w,n.d),mat);m.rotation.x=Math.PI/2;m.position.set(px,-proud,pz);} /* faces down, under the box */
 else if(face==="south"){m=new THREE.Mesh(new THREE.PlaneGeometry(n.w,h),mat);m.rotation.y=Math.PI;m.position.set(px,h/2+0.02,n.y-proud);}
 else if(face==="east"){m=new THREE.Mesh(new THREE.PlaneGeometry(n.d,h),mat);m.rotation.y=Math.PI/2;m.position.set(n.x+n.w+proud,h/2+0.02,pz);}
 else if(face==="west"){m=new THREE.Mesh(new THREE.PlaneGeometry(n.d,h),mat);m.rotation.y=-Math.PI/2;m.position.set(n.x-proud,h/2+0.02,pz);}
 else{m=new THREE.Mesh(new THREE.PlaneGeometry(n.w,h),mat);m.position.set(px,h/2+0.02,n.y+n.d+proud);} /* north */
 m.renderOrder=2;
 return m;
}
/* letterbox a texture to its face once the source aspect is known */
function containFit(tex: THREE.Texture,vw: number,vh: number,pw: number,ph: number): void {
 if(!vw||!vh)return;
 const pa=pw/ph,va=vw/vh;tex.repeat.set(1,1);tex.offset.set(0,0);
 if(va>pa){tex.repeat.y=pa/va;tex.offset.y=(1-tex.repeat.y)/2;}else{tex.repeat.x=va/pa;tex.offset.x=(1-tex.repeat.x)/2;}
}
function faceDims(n: MapNode,face: FaceKey): { pw: number; ph: number } {
 const h=Math.max(n.h,0.6);
 return (face==="roof"||face==="bottom")?{pw:n.w,ph:n.d}:{pw:face==="east"||face==="west"?n.d:n.w,ph:h};
}
/* ————— shared video pool —————
   One <video> decode per distinct source, no matter how many faces show it. 60
   surfaces sampling 6 sources costs 6 decoders, not 60 — that is the difference
   between a slideshow and a smooth city. Each face gets its own VideoTexture over
   the shared element so UVs/letterboxing stay per-face. */
type PooledVideo={ video: HTMLVideoElement; live: boolean; refs: number; group?: string; src: string };
const videoPool: Record<string, PooledVideo>={};
function acquireVideo(src: string,ref: SurfaceRef): PooledVideo {
 const existing=videoPool[src];
 if(existing){existing.refs++;return existing;}
 const live=ref.live===true||/\.m3u8(\?|$)/i.test(src);
 const video=document.createElement("video");
 video.muted=true;video.loop=!live;video.playsInline=true;video.crossOrigin="anonymous";
 /* a live feed is content, not decoration: it plays even under reduced-motion.
    Looping/decorative video holds its first frame for RM users; live does not. */
 const mayPlay=!RM||live;
 video.autoplay=mayPlay;video.preload=live?"auto":"metadata";
 video.src=src; /* native HLS plays where supported; an hls.js shim can attach here later */
 if(mayPlay)video.play().catch(()=>{/* autoplay may wait for a gesture */});
 const pv: PooledVideo={video,live,refs:1,group:ref.group,src};
 videoPool[src]=pv;
 if(ref.group)joinSyncGroup(ref.group,video);
 return pv;
}
function releaseVideo(src: string): void {
 const pv=videoPool[src];if(!pv)return;
 pv.refs--;
 if(pv.refs>0)return;
 pv.video.pause();pv.video.removeAttribute("src");pv.video.load();
 if(pv.group)leaveSyncGroup(pv.group,pv.video);
 delete videoPool[src];
}
/* one VideoTexture per distinct source, shared across every face showing it.
   The GPU upload happens once per source per frame, not once per face — this is
   the difference between 60 uploads and 6. Only `cover` shares (no per-face UV);
   `contain` letterboxes per face so it gets a private texture. */
const videoTexPool: Record<string, { tex: THREE.VideoTexture; refs: number }>={};
function acquireVideoTex(pv: PooledVideo,fit: string): { tex: THREE.VideoTexture; shared: boolean } {
 if(fit==="cover"){
  const k=pv.src;
  const ex=videoTexPool[k];if(ex){ex.refs++;return{tex:ex.tex,shared:true};}
  const tex=new THREE.VideoTexture(pv.video);tex.colorSpace=THREE.SRGBColorSpace;
  videoTexPool[k]={tex,refs:1};return{tex,shared:true};
 }
 const tex=new THREE.VideoTexture(pv.video);tex.colorSpace=THREE.SRGBColorSpace;
 return{tex,shared:false};
}
function releaseVideoTex(src: string,tex: THREE.VideoTexture,shared: boolean): void {
 if(!shared){tex.dispose();return;}
 const e=videoTexPool[src];if(!e)return;
 e.refs--;if(e.refs<=0){e.tex.dispose();delete videoTexPool[src];}
}
function buildVideo(n: MapNode,face: FaceKey,ref: SurfaceRef): SurfaceEntry | null {
 const src=ref.src;if(!src)return null;
 const pv=acquireVideo(src,ref);
 const video=pv.video;
 const fit=ref.fit??"cover";
 const {tex,shared}=acquireVideoTex(pv,fit);
 const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,toneMapped:false});
 const plane=facePlane(n,face,mat);
 /* fit:contain letterboxes by shrinking the UVs to the source aspect once known */
 if(fit==="contain")video.addEventListener("loadedmetadata",()=>{
  const {pw,ph}=faceDims(n,face);containFit(tex,video.videoWidth,video.videoHeight,pw,ph);
 });
 meshById[n.id].add(plane);
 return {plane,kind:"video",video,moduleId:n.id,group:ref.group,audio:ref.audio,dispose(){const par=plane.parent;if(par)par.remove(plane);plane.geometry.dispose();mat.dispose();releaseVideoTex(src,tex,shared);releaseVideo(src);}};
}
/* ————— synchronized theater: surfaces that share a group play frame-locked —————
   One clock per group. The first ready video is the master; every other member's
   currentTime is steered toward the master's each tick (gentle playbackRate nudge
   for sub-frame drift, hard seek for gross drift) so a wall of screens reads as
   one image, like a stadium. */
const syncGroups: Record<string, HTMLVideoElement[]>={};
function joinSyncGroup(g: string,v: HTMLVideoElement): void { (syncGroups[g]=syncGroups[g]||[]).push(v); }
function leaveSyncGroup(g: string,v: HTMLVideoElement): void { const a=syncGroups[g];if(!a)return;const i=a.indexOf(v);if(i>=0)a.splice(i,1);if(!a.length)delete syncGroups[g]; }
function syncTick(): void {
 Object.values(syncGroups).forEach(members=>{
  const ready=members.filter(v=>v.readyState>=2&&!v.paused);
  if(ready.length<2)return;
  const master=ready[0],mt=master.currentTime;
  ready.slice(1).forEach(v=>{
   const d=v.currentTime-mt;
   if(Math.abs(d)>0.35){v.currentTime=mt;v.playbackRate=1;} /* gross drift: snap */
   else if(Math.abs(d)>0.03)v.playbackRate=1-d*0.5;          /* fine drift: steer */
   else v.playbackRate=1;
  });
 });
}
function buildImage(n: MapNode,face: FaceKey,ref: SurfaceRef): SurfaceEntry | null {
 const src=ref.src;if(!src)return null;
 const loader=new THREE.TextureLoader();loader.crossOrigin="anonymous";
 const mat=new THREE.MeshBasicMaterial({transparent:true,toneMapped:false});
 const plane=facePlane(n,face,mat);
 const tex=loader.load(src,t=>{
  tex.colorSpace=THREE.SRGBColorSpace;
  if((ref.fit??"cover")==="contain"){const {pw,ph}=faceDims(n,face);containFit(tex,t.image.width,t.image.height,pw,ph);}
 });
 mat.map=tex;mat.needsUpdate=true;
 meshById[n.id].add(plane);
 return {plane,kind:"image",moduleId:n.id,dispose(){const par=plane.parent;if(par)par.remove(plane);plane.geometry.dispose();mat.dispose();tex.dispose();}};
}
/* mist: the advisory wash, placed on the assigned face. Registered into
   advisoryById so the tick loop's uTime accumulation and theme repaint reach it. */
function buildMist(n: MapNode,face: FaceKey): SurfaceEntry | null {
 const cats=Array.from(new Set((n.items||[]).map(i=>i.c).filter(c=>ADVISORY_FILL[c])));
 const base=advisoryPlane(n,cats);if(!base)return null;
 base.geometry.dispose(); /* the advisory helper builds a front-face plane; re-place on the requested face */
 const placed=facePlane(n,face,base.material) as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
 placed.userData.advisoryCats=base.userData.advisoryCats;
 meshById[n.id].add(placed);
 (advisoryById[n.id]=advisoryById[n.id]||[]).push(placed);
 return {plane:placed,kind:"mist",moduleId:n.id,dispose(){const par=placed.parent;if(par)par.remove(placed);placed.geometry.dispose();placed.material.dispose();
  const arr=advisoryById[n.id];if(arr){const i=arr.indexOf(placed);if(i>=0)arr.splice(i,1);}}};
}
function buildPlaceholder(n: MapNode,face: FaceKey,kind: SurfaceKind): SurfaceEntry {
 /* TODO(slice6): real doc/slides/ink renderer */
 const mat=new THREE.MeshBasicMaterial({color:COL.alt,transparent:true,opacity:0.35});
 const plane=facePlane(n,face,mat);
 meshById[n.id].add(plane);
 return {plane,kind,moduleId:n.id,dispose(){const par=plane.parent;if(par)par.remove(plane);plane.geometry.dispose();mat.dispose();}};
}
/* spec's `media` field → effective per-face map, with legacy face aliases */
const LEGACY_FACE: Record<string, FaceKey> = { front: "north", left: "west", right: "east" };
function refreshSurfaces(n: MapNode): void {
 const old=surfacesById[n.id];
 if(old){Object.values(old).forEach(e=>e&&e.dispose());delete surfacesById[n.id];}
 const effective: Partial<Record<FaceKey, SurfaceRef | null>> = {};
 /* media is one surface or a list (one per face); normalize to the list */
 const mediaList: MediaSpec[] = !n.media ? [] : Array.isArray(n.media) ? n.media : [n.media];
 mediaList.forEach(ms=>{
  if(!ms.src)return;
  const raw=ms.face??"front";
  const f=(LEGACY_FACE[raw]??raw) as FaceKey;
  effective[f]={kind:"video",src:ms.src,fit:ms.fit,live:ms.live,group:ms.group,audio:ms.audio};
 });
 const ann=getModule(n.id).faces;
 if(ann)for(const k of Object.keys(ann) as FaceKey[])effective[k]=ann[k];
 const next: Partial<Record<FaceKey, SurfaceEntry>> = {};
 for(const face of Object.keys(effective) as FaceKey[]){
  const ref=effective[face];if(!ref)continue;
  const entry=ref.kind==="video"?buildVideo(n,face,ref)
   :ref.kind==="image"?buildImage(n,face,ref)
   :ref.kind==="mist"?buildMist(n,face)
   :buildPlaceholder(n,face,ref.kind);
  if(entry)next[face]=entry;
 }
 if(Object.keys(next).length)surfacesById[n.id]=next;
 syncSoundButton();
}
function setMediaDim(id: string,on: boolean): void {
 const faces=surfacesById[id];if(!faces)return;
 Object.values(faces).forEach(e=>{
  if(!e)return;
  const m=e.plane.material as THREE.MeshBasicMaterial;
  if("opacity" in m){m.opacity=on?1:0.28;m.transparent=true;}
 });
}
/* modules that carry at least one audible surface */
function audibleModules(): string[] {
 return Object.keys(surfacesById).filter(id=>Object.values(surfacesById[id]||{}).some(e=>e&&e.audio&&e.video));
}

/* ————— audio model —————
   Master toggle (the dock Sound button) ships OFF and gates everything. Only ONE
   module's track is ever audible at a time — a wall of screens, one voice. Which
   module is the "audio focus": shift+click a module to solo its sound without
   selecting it (no camera, no inspector); selecting a module also moves the focus
   to it. With master on and no explicit focus, the hero (first audible module)
   holds the voice so the theater is never silent-by-accident. Master off = silent. */
let masterAudio=false;              /* ships silent */
let audioFocus: string | null=null; /* module id whose track is live */
const btnSound=$<HTMLButtonElement>("btnSound");
function audibleEntry(id: string): SurfaceEntry | null {
 const faces=surfacesById[id];if(!faces)return null;
 for(const e of Object.values(faces))if(e&&e.audio&&e.video)return e;
 return null;
}
/* enforce the one-voice invariant. Surfaces that share a source share ONE pooled
   <video> element, so loudness is decided per SOURCE, not per face: only the
   focused module's source is unmuted, every other pooled element stays muted. */
function focusSrc(): string | null {
 if(!audioFocus)return null;
 const e=audibleEntry(audioFocus);
 return e&&e.video?(e.video as HTMLVideoElement & {__src?:string}).currentSrc||null:null;
}
function applyAudio(): void {
 const mods=audibleModules();
 if(masterAudio&&(!audioFocus||!mods.includes(audioFocus)))audioFocus=mods[0]??null; /* default voice: first audible module */
 const target=focusSrc();
 Object.values(videoPool).forEach(pv=>{
  const audible=masterAudio&&!!target&&pv.video.currentSrc===target;
  pv.video.muted=!audible;
  if(audible){pv.video.volume=1;if(pv.video.paused)pv.video.play().catch(()=>{});}
 });
 syncSoundButton();
 refreshNowPlaying();
}
function setAudioFocus(id: string | null): void { audioFocus=id;applyAudio(); }
function syncSoundButton(): void {
 const any=audibleModules().length>0;
 btnSound.hidden=!any;
 const audible=masterAudio&&any;
 btnSound.setAttribute("aria-pressed",String(audible));
 btnSound.setAttribute("aria-label",audible?"Sound: mute all media":"Sound: unmute media (one track at a time)");
 setCanonicalIcon(btnSound,audible?iconSoundOn:iconSoundOff);
}
btnSound.addEventListener("click",()=>{
 masterAudio=!masterAudio;         /* the click is the gesture that unlocks audio */
 applyAudio();
});
/* sensible per-module media controls, driven from the inspector and QA hooks.
   play/pause the module's surface; solo = take the one audio voice. */
const mediaControls={
 state(id: string): { hasMedia: boolean; audible: boolean; playing: boolean; t: number } {
  const e=audibleEntry(id);
  const faces=surfacesById[id];
  const anyVideo=faces?Object.values(faces).find(x=>x&&x.video):null;
  const v=e?.video??anyVideo?.video;
  return {hasMedia:!!faces&&Object.keys(faces).length>0,audible:!!(e&&e.video&&!e.video.muted),playing:!!(v&&!v.paused),t:v?v.currentTime:0};
 },
 togglePlay(id: string): void {
  const faces=surfacesById[id];if(!faces)return;
  Object.values(faces).forEach(e=>{if(e&&e.video){if(e.video.paused)e.video.play().catch(()=>{});else e.video.pause();}});
 },
 solo(id: string): void { if(!masterAudio)masterAudio=true;setAudioFocus(id); },
 restart(id: string): void {
  const faces=surfacesById[id];if(!faces)return;
  const seen=new Set<HTMLVideoElement>();
  Object.values(faces).forEach(e=>{if(e&&e.video&&!seen.has(e.video)){seen.add(e.video);e.video.currentTime=0;if(e.video.paused)e.video.play().catch(()=>{});}});
 },
};

/* ————— media transport: one button, bottom-left above the avatar —————
   Only appears when a module actually holds the voice (no media, no button — the
   map isn't always a theater). Click toggles play/pause; Shift+click starts over. */
const npPlay=$<HTMLButtonElement>("npPlay");
function npModule(): string | null { return audioFocus??(cordon.size===1?[...cordon][0]:null); }
function npVideo(): HTMLVideoElement | null {
 const id=npModule();if(!id)return null;
 const faces=surfacesById[id];if(!faces)return null;
 const e=audibleEntry(id)??Object.values(faces).find(x=>x&&x.video)??null;
 return e&&e.video?e.video:null;
}
function refreshNowPlaying(): void {
 const id=npModule(),v=npVideo();
 if(!id||!v){npPlay.hidden=true;return;}
 npPlay.hidden=false;
 const playing=!v.paused;
 npPlay.classList.toggle("is-playing",playing);
 npPlay.setAttribute("aria-label",(playing?"Pause":"Play")+" — "+(byId[id]&&(byId[id].name||id)||id));
}
npPlay.addEventListener("click",ev=>{
 const id=npModule();if(!id)return;
 if(ev.shiftKey)mediaControls.restart(id);else mediaControls.togglePlay(id);
 refreshNowPlaying();
});
function nowPlayingTick(): void {
 if(npPlay.hidden)return;
 const v=npVideo();
 const playing=!!(v&&!v.paused);
 if(playing!==npPlay.classList.contains("is-playing"))refreshNowPlaying();
}
/* graph edges on the ground */
/* connection health: a link can be broken/degraded independent of its modules.
   broken = risk red, gapped, and flow refuses to cross. degraded = amber, slow flow. */
const EDGESTATUS=SPEC.edgeStatus||{};
/* seams → sensors: per-module telemetry binding (docs/INSTRUMENTATION.md) */
const TELEMETRY=SPEC.telemetry||{};
function sensorBlock(id: string): string {
 const t=TELEMETRY[id];if(!t)return "";
 const st=t.trace_boundary||"proposed";
 const cls=st==="installed"||st==="verified"?"good":st==="declined"?"":"cond";
  let h="<div class='"+(cls||"dp-type-body-xs")+" dp-type-body-xs'"+(cls?"":"")+"><span class='dp-type-label-sm'>Sensor &middot; "+st.toUpperCase()+"</span><br>";
 h+="trace boundary on every crossing of this seam";
 if(t.event_stream)h+=" &middot; events &rarr; <code>"+t.event_stream+"</code>";
 if(t.wide_event_keys&&t.wide_event_keys.length)h+="<br>wide-event keys: "+t.wide_event_keys.join(", ");
 if(t.rationale)h+="<br><span>"+t.rationale+"</span>";
 const prov=[];if(t.installed_by)prov.push("installed by "+t.installed_by);if(t.offered_at)prov.push("offered "+t.offered_at);if(t.verified_at)prov.push("verified "+t.verified_at);
 if(prov.length)h+="<br><span>"+prov.join(" &middot; ")+"</span>";
 return h+"</div>";
}
const __ROUTED: RouteOutput = { routes: {}, hops: {}, qc: {} };
function edgePath(e: EdgeTuple): THREE.Vector3[] {
 const points = __ROUTED.routes[`${e[0]}-${e[1]}`];
 if (!points) throw new Error(`Router did not produce path ${e[0]}-${e[1]}`);
 return points.map(p=>new THREE.Vector3(p[0],0.03,p[1]));
}
/* ————— R31 junction grammar —————
   A link JOINS a module: a dot sits where the pipe meets the wall (electrical convention).
   A link CROSSES another: the crossing pipe hops it with a small arc — never a dot.
   Hops come from the shared router (same source DRC lints), so the drawing and the lint agree. */
const HOP={r:0.15,h:0.13,n:7};
function insertHops(pts: THREE.Vector3[],key: string): THREE.Vector3[]{
 const hs=__ROUTED.hops[key];if(!hs||!hs.length)return pts;
 hs.forEach(([hx,hz])=>{
  for(let i=1;i<pts.length;i++){
   const a=pts[i-1],b=pts[i];
   if(Math.abs(a.y-b.y)>1e-6)continue;                    /* risers never carry hops */
   const horiz=Math.abs(a.z-b.z)<1e-6,vert=Math.abs(a.x-b.x)<1e-6;
   if(!horiz&&!vert)continue;
   const on=horiz?(Math.abs(a.z-hz)<1e-3&&hx>Math.min(a.x,b.x)+HOP.r&&hx<Math.max(a.x,b.x)-HOP.r)
                 :(Math.abs(a.x-hx)<1e-3&&hz>Math.min(a.z,b.z)+HOP.r&&hz<Math.max(a.z,b.z)-HOP.r);
   if(!on)continue;
   const u=new THREE.Vector3().subVectors(b,a).normalize(),c=new THREE.Vector3(hx,a.y,hz),arc=[];
   for(let k=0;k<=HOP.n;k++){const t=-1+2*k/HOP.n;const q=c.clone().addScaledVector(u,t*HOP.r);q.y=a.y+HOP.h*Math.sqrt(Math.max(0,1-t*t));arc.push(q);}
   pts.splice(i,0,...arc);
   break;
  }
 });
 return pts;
}
const junctionGeo=new THREE.CylinderGeometry(1,1,0.018,18);
function junctionMesh(): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>{const m=new THREE.Mesh(junctionGeo,new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}));m.renderOrder=2;scene.add(m);return m;}
function junctionScale(){return 0.075*LINEW[lineSet].dot;}
/* connections: dashed lines that TRACE THE PATH (they bend with corners).
   Flow = the dash pattern itself marching along the line via a shader offset. */
/* ————— levels: the architecture's honest strata —————
   +1 the rulebook governs from above · 0 the referee runs at ground ·
   −1 the field below (installs, downstream, feedback — and the work rising from it).
   Flat by default; Stack lifts each stratum to its plane. */
const LEVELS=SPEC.levels||{};

/* flow grammar: static = solid line to inspect from any angle; Flow = dots along the pipe */
const DOTSETS=[{label:"Fine",r:0.032,gap:0.5},{label:"Medium",r:0.046,gap:0.72},{label:"Bold",r:0.062,gap:1.05}];
let dotSet=1;
/* static line weight — true pixel widths via fat lines; dots scale with it */
const LINEW=[{label:"Hairline",w:1.25,dot:0.8},{label:"Regular",w:2,dot:1},{label:"Heavy",w:3.25,dot:1.35}];
let lineSet=1;
const edgeMats: LineMaterial[] = [];
function baseOp(o: EdgeRuntime): number {return o.type==="auth"?0.95:o.health==="broken"?0.95:o.health==="degraded"?0.9:o.type==="intended"?0.4:0.75;}
function edgeMat(colGet: () => THREE.Color,op: number): LineMaterial {
 const m=new LineMaterial({color:colGet().getHex(),transparent:true,opacity:op,linewidth:LINEW[lineSet].w});
 themed.push({m,get:colGet});edgeMats.push(m);
 return m;
}
const dotMatN=new THREE.MeshBasicMaterial({color:COL.accent});
const dotMatW=new THREE.MeshBasicMaterial({color:COL.caution});
function edgePts3D(o: EdgeRuntime): THREE.Vector3[] {
 const ya=byId[o.a]._ly+0.03,yb=byId[o.b]._ly+0.03;
 const pts=o.basePts.map(p=>new THREE.Vector3(p.x,ya,p.z));
 if(Math.abs(yb-ya)>1e-4){
  /* cross-level: riser stands OUTSIDE the wall, then a stub enters the wall AT the
     destination's level — the connection is real from every camera angle */
  const last=pts[pts.length-1],prev=pts[pts.length-2];
  const dir=new THREE.Vector3().subVectors(last,prev);dir.y=0;
  if(dir.length()>0.45){
   dir.normalize();
   const riser=new THREE.Vector3().copy(last).addScaledVector(dir,-0.42);
   pts[pts.length-1]=riser;
   pts.push(new THREE.Vector3(riser.x,yb,riser.z));
   pts.push(new THREE.Vector3(last.x,yb,last.z));
  }else{
   pts.push(new THREE.Vector3(last.x,yb,last.z));
  }
 }
 return insertHops(pts,o.key);
}
function rebuildEdge(o: EdgeRuntime): void {
 o.pts=edgePts3D(o);
 const sc=junctionScale();
 o.jn[0].position.copy(o.pts[0]);o.jn[1].position.copy(o.pts[o.pts.length-1]);
 o.jn.forEach(j=>j.scale.set(sc,1,sc));
 o.line.geometry.dispose();
 const flat: number[]=[];o.pts.forEach((p: THREE.Vector3)=>flat.push(p.x,p.y,p.z));
 o.line.geometry=new LineGeometry();
 o.line.geometry.setPositions(flat);
 o.L=[0];for(let i=1;i<o.pts.length;i++)o.L.push(o.L[i-1]+o.pts[i].distanceTo(o.pts[i-1]));
 o.total=Math.max(0.001,o.L[o.L.length-1]);
}
function buildDots(o: EdgeRuntime): void {
 o.dots.forEach(d=>{scene.remove(d);d.geometry.dispose();});
 o.dots=[];
 if(!o.dotted)return;
 const p=DOTSETS[dotSet];
 const count=Math.max(2,Math.round(o.total/p.gap));
 const rr=p.r*LINEW[lineSet].dot;
 for(let k=0;k<count;k++){
  const d=new THREE.Mesh(new THREE.SphereGeometry(rr,8,8),o.health==="degraded"?dotMatW:dotMatN);
  d.visible=false;scene.add(d);o.dots.push(d);
 }
}
function rebuildAllEdges(){Object.values(edgeLinesById).forEach(o=>{rebuildEdge(o);buildDots(o);});}

/* ————— navigation: standard OrbitControls (industry-standard, multi-device) —————
   Mouse: drag = orbit · wheel = zoom · right-drag = pan
   Touch: one finger = orbit · pinch = zoom · two-finger drag = pan */
const HOME={tx:CENTER.x,ty:1.0,tz:CENTER.z,r:40,az:-Math.PI/4,pol:0.9553,zoom:1.12};
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=0.08;
controls.minZoom=0.35;controls.maxZoom=24; /* punch right in to a single face */
controls.minPolarAngle=0.05;controls.maxPolarAngle=Math.PI-0.05;
controls.screenSpacePanning=false;
function placeCamera(az: number,pol: number,r: number,tx: number,ty: number,tz: number,zoom: number): void {
 controls.target.set(tx,ty,tz);
 camera.position.set(tx+Math.sin(az)*Math.sin(pol)*r, ty+Math.cos(pol)*r, tz+Math.cos(az)*Math.sin(pol)*r);
 if(zoom){camera.zoom=zoom;camera.updateProjectionMatrix();}
 controls.update();
}
placeCamera(HOME.az,HOME.pol,HOME.r,HOME.tx,HOME.ty,HOME.tz,HOME.zoom);
let flyGoal: { tx: number; ty: number; tz: number; zoom: number; az?: number; pol?: number } | null = null;
controls.addEventListener("start",()=>{flyGoal=null;}); /* user input cancels autopilot */
function resetView(){clearEdgeSel();flowing=false;btnFlow.setAttribute("aria-pressed","false");setCanonicalIcon(btnFlow,iconPlay);exitCordon();brush.clear();flyGoal={tx:HOME.tx,ty:HOME.ty,tz:HOME.tz,zoom:HOME.zoom,az:HOME.az,pol:HOME.pol};clearTrace();renderModuleNavigator();}
$("btnReset").addEventListener("click",resetView);
document.addEventListener("keydown",ev=>{
 if(ev.key!=="r"&&ev.key!=="R")return;
 if(isEditableTarget(ev.target))return; /* typing "r" in the search field is not a camera command */
 if(readerModalOpen||drawer.classList.contains("open"))return; /* a modal owns the screen */
 resetView();
});
/* quick media control: Space = play/pause the module holding the voice, 0 = start it over */
document.addEventListener("keydown",ev=>{
 if(ev.key!==" "&&ev.key!=="0")return;
 if(isEditableTarget(ev.target))return;                 /* typing in a field is not a transport command */
 if(readerModalOpen||drawer.classList.contains("open"))return;
 const id=audioFocus??(cordon.size===1?[...cordon][0]:null);
 if(!id)return;
 ev.preventDefault();
 if(ev.key===" ")mediaControls.togglePlay(id);else mediaControls.restart(id);
 refreshNowPlaying();
});
document.addEventListener("keydown",ev=>{
 if(ev.key!=="w"&&ev.key!=="W")return;
 if(isEditableTarget(ev.target))return;
 if(readerModalOpen||drawer.classList.contains("open"))return;
 brush.setActive(!brush.isActive());
});
/* zoom bounds are communicated, not silent: buttons report aria-disabled at the limits */
const ZOOM_MIN=0.35,ZOOM_MAX=6;
function syncZoomButtons(): void {
 $("zin").setAttribute("aria-disabled",String(camera.zoom>=ZOOM_MAX-1e-4));
 $("zout").setAttribute("aria-disabled",String(camera.zoom<=ZOOM_MIN+1e-4));
}
$("zin").addEventListener("click",()=>{
 if(camera.zoom>=ZOOM_MAX-1e-4)return;
 camera.zoom=Math.min(ZOOM_MAX,camera.zoom*1.25);camera.updateProjectionMatrix();syncZoomButtons();});
$("zout").addEventListener("click",()=>{
 if(camera.zoom<=ZOOM_MIN+1e-4)return;
 camera.zoom=Math.max(ZOOM_MIN,camera.zoom/1.25);camera.updateProjectionMatrix();syncZoomButtons();});
controls.addEventListener("change",syncZoomButtons);
syncZoomButtons();
window.__isoEdgeMid=key=>{const o=edgeLinesById[key];if(!o||!o.pts.length)return null;const p=o.pts[Math.floor(o.pts.length/2)-0]||o.pts[0];const q=o.pts.length>1?o.pts[Math.floor(o.pts.length/2)]:p;const m=p.clone().add(q).multiplyScalar(0.5);const v=m.project(camera);const r=canvas.getBoundingClientRect();return {x:r.left+(v.x*0.5+0.5)*r.width,y:r.top+(-v.y*0.5+0.5)*r.height};};
window.odinView={set(az,pol,r,zoom){placeCamera(az??HOME.az,pol??HOME.pol,r??HOME.r,controls.target.x,controls.target.y,controls.target.z,zoom);},
 /* test hooks (module scope is closed): look = cancel autopilot + aim; restore = leave any circuit/blast scope */
 look(tx,tz,zoom,az,pol){flyGoal=null;placeCamera(az??HOME.az,pol??HOME.pol,HOME.r,tx,0,tz,zoom??camera.zoom);},
 restore(){flyGoal=null;exitCordon();paintCircuit();renderPanel(null);},
 inspect(id){pinned=id;NODES.forEach(n=>mark(n.id,n.id===id));renderPanel(id);},
 media:mediaControls, /* per-module media: state/togglePlay/solo (inspector + QA) */
 state:()=>({zoom:camera.zoom,cordon:[...cordon],audioFocus,masterAudio})};
function flyTo(n: MapNode): void {flyGoal={tx:n.x+n.w/2,ty:(n._lyT||0)+0.5,tz:n.y+n.d/2,
 zoom:Math.max(camera.zoom,2.1)};}
/* click-vs-drag disambiguation (no pointer capture — OrbitControls owns the gestures) */
let downPt: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown",ev=>{downPt={x:ev.clientX,y:ev.clientY};});
canvas.addEventListener("pointerup",ev=>{
 if(brush.isActive()){downPt=null;return;} /* the brush owns the pointer while drawing */
 if(downPt&&Math.abs(ev.clientX-downPt.x)<5&&Math.abs(ev.clientY-downPt.y)<5&&ev.button===0)
   pickAt(ev.clientX,ev.clientY,ev.shiftKey,false);
 downPt=null;
});
canvas.addEventListener("dblclick",ev=>{pickAt(ev.clientX,ev.clientY,ev.shiftKey,true);});

/* ————— picking, hover, selection ————— */
const ray=new THREE.Raycaster(),ptr=new THREE.Vector2();
let hoverId: string | null = null, pinned: string | null = null;
type Hit = { kind: "node"; id: string } | { kind: "edge"; key: string } | null;
function castAt(cx: number,cy: number): Hit {
 const r=canvas.getBoundingClientRect();
 ptr.x=((cx-r.left)/r.width)*2-1;ptr.y=-((cy-r.top)/r.height)*2+1;
 ray.setFromCamera(ptr,camera);
 ray.camera=camera; /* required for fat-line (Line2) raycast */
 const hit=ray.intersectObjects(pickables,false);
 if(hit.length)return {kind:"node",id:hit[0].object.userData.id};
 const lines=Object.values(edgeLinesById).map(o=>o.line);
 const lh=ray.intersectObjects(lines,false);
 if(lh.length&&lh[0].object.userData.edgeKey)return {kind:"edge",key:lh[0].object.userData.edgeKey};
 return null;
}
canvas.addEventListener("pointermove",ev=>{
 if(downPt)return; /* mid-gesture: let OrbitControls own it */
 const hit=castAt(ev.clientX,ev.clientY);
 const hid=hit?(hit.kind==="node"?hit.id:"E:"+hit.key):null;
 if(hid!==hoverId){hoverId=hid;
   if(!pinned&&!cordon.size&&!selEdge){
     if(hit&&hit.kind==="node"){NODES.forEach(n=>mark(n.id,n.id===hit.id));renderPanel(hit.id);}
     else if(hit&&hit.kind==="edge"){NODES.forEach(n=>mark(n.id,false));renderEdgePanel(hit.key);}
     else{NODES.forEach(n=>mark(n.id,false));renderPanel(null);}
   }
   canvas.style.cursor=hit?"pointer":"grab";}
});
let selEdge: string | null = null;
function clearEdgeSel(){
 if(!selEdge)return;
 const o=edgeLinesById[selEdge];
 if(o)o.line.material.linewidth=LINEW[lineSet].w;
 selEdge=null;
}
function selectEdge(key: string): void {
 clearEdgeSel();
 selEdge=key;
 const o=edgeLinesById[key];
 o.line.material.opacity=baseOp(o);
 o.line.material.linewidth=LINEW[lineSet].w+1.4; /* selected link reads heavier */
 const e=key.split("-");
 NODES.forEach(n=>mark(n.id,e.indexOf(n.id)>=0));
 renderEdgePanel(key);
}
function pickAt(cx: number,cy: number,shift: boolean,dbl: boolean): void {
 incidentActive=false;
 const hit=castAt(cx,cy);
 /* Selection only ever changes on shift+click or double-click. A PLAIN click on a
    module just steers the single voice to it — sound follows what you point at,
    without touching the cordon. */
 if(hit&&hit.kind==="node"&&!shift&&!dbl){
  if(audibleModules().includes(hit.id)){if(!masterAudio)masterAudio=true;setAudioFocus(hit.id);}
  return;                                        /* plain click: audio only, no select */
 }
 if(hit&&hit.kind==="node"){                    /* shift+click or double-click: toggle */
  clearEdgeSel();
  if(cordon.has(hit.id))cordon.delete(hit.id);   /* cut the breaker */
  else{cordon.add(hit.id);flyTo(byId[hit.id]);}  /* energize */
  if(cordon.size===1)setAudioFocus([...cordon][0]); /* a single selection takes the voice */
  applyCircuit();return;
 }
 if(hit&&hit.kind==="edge"){selectEdge(hit.key);return;}
 if(!shift&&!dbl)return;                        /* plain click on ground: leave the cordon be */
 clearEdgeSel();
 cordon.clear();                                  /* shift/dbl-click empty ground: board back to live */
 pinned=null;NODES.forEach(n=>mark(n.id,false));
 applyCircuit();
}
function mark(id: string,on: boolean): void {
 const g=meshById[id];
 const lb=$("lb-"+id);if(lb)lb.classList.toggle("hot",on);
 const li=document.getElementById("li-"+id);
 if(li){li.classList.toggle("is-pressed",on);li.setAttribute("aria-pressed",String(on));}
 if(g){g.traverse((o: THREE.Object3D)=>{if(o instanceof THREE.LineSegments){const material=o.material;if(!Array.isArray(material)&&"color" in material)material.color=on?COL.accent:COL.fg1;}});}
}
/* peek = title-only resting state (~16vh); medium/large are starting heights.
   The tray is free-draggable: drag the head to any height and the body scrolls. */
type SheetDetent="peek"|"medium"|"large";
let sheetDetent: SheetDetent="medium";
function detentHeight(detent: SheetDetent): number {
 const vh=window.innerHeight;
 if(detent==="peek")return Math.min(Math.max(0.16*vh,5.6*16),8.4*16);
 if(detent==="medium")return 0.46*vh;
 return 0.88*vh;
}
function setSheetDetent(detent: SheetDetent): void {
 sheetDetent=detent;
 readingPanel.classList.remove("free");
 readingPanel.classList.toggle("is-peek",detent==="peek");
 readingPanel.classList.toggle("is-medium",detent==="medium");
 readingPanel.classList.toggle("is-large",detent==="large");
 readingPanel.style.height=""; /* let the detent class own the height */
 sheetGrabber.setAttribute("aria-label",detent==="large"?"Collapse reading panel":"Expand reading panel");
}
/* free drag: any height between peek and nearly-full; content stays live+scrollable */
function setSheetHeight(px: number): void {
 const min=detentHeight("peek"),max=window.innerHeight*0.94;
 const h=Math.round(Math.min(max,Math.max(min,px)));
 readingPanel.classList.add("free");
 readingPanel.classList.remove("is-peek","is-medium","is-large");
 readingPanel.style.height=h+"px";
}
function openReadingPanel(focusSearch=false): void {
 if(!compactReader.matches)return;
 if(drawer.classList.contains("open"))closeSettings(); /* layers are exclusive: one surface at a time */
 const ae=document.activeElement;
 readingReturnFocus=ae instanceof HTMLElement&&ae!==document.body?ae:btnReadMap;
 readingScrim.hidden=true; /* the tray floats over the art; a dim scrim is not part of this product */
 sideRail.inert=false;canvasWrap.inert=false; /* the art stays alive under the tray */
 readingPanel.hidden=false;readingPanel.inert=false;readerModalOpen=true;
 setSheetDetent(sheetDetent==="peek"?"medium":sheetDetent);
 readingPanel.setAttribute("role","dialog");readingPanel.removeAttribute("aria-modal");
 btnReadMap.setAttribute("aria-expanded","true");
 trayHandle.hidden=true;
 if(focusSearch)requestAnimationFrame(()=>moduleSearch.focus());
}
const readingPanel=$<HTMLElement>("readingPanel");
const btnReadMap=$<HTMLButtonElement>("btnReadMap");
const readingScrim=$<HTMLElement>("readingScrim");
const sideRail=$<HTMLElement>("mapControls");
const canvasWrap=$<HTMLElement>("canvasWrap");
const trayHandle=$<HTMLButtonElement>("trayHandle");
const panelResizer=$<HTMLElement>("panelResizer");
const compactReader=window.matchMedia("(max-width: 1180px)");
let readingReturnFocus: HTMLElement | null=null;
let readerModalOpen=false;
function closeReadingPanel(): void {
 readerModalOpen=false;
 btnReadMap.setAttribute("aria-expanded","false");
 if(compactReader.matches){readingScrim.hidden=true;readingPanel.hidden=true;readingPanel.inert=true;trayHandle.hidden=false;}
 (readingReturnFocus?.isConnected?readingReturnFocus:btnReadMap).focus();readingReturnFocus=null;
}
function syncReaderLayout(): void {
 if(compactReader.matches){
  readerModalOpen=false;readingScrim.hidden=true;readingPanel.hidden=true;readingPanel.inert=true;
  readingPanel.classList.add("dp-sheet");readingPanel.classList.remove("is-peek","is-medium","is-large");
  readingPanel.setAttribute("role","dialog");readingPanel.removeAttribute("aria-modal");
  sideRail.inert=false;canvasWrap.inert=false;btnReadMap.setAttribute("aria-expanded","false");
  trayHandle.hidden=false;panelResizer.hidden=true;
 }else{
  readingScrim.hidden=true;readingPanel.hidden=false;readingPanel.inert=false;
  readingPanel.classList.remove("dp-sheet","is-peek","is-medium","is-large");
  readingPanel.setAttribute("role","complementary");readingPanel.removeAttribute("aria-modal");
  sideRail.inert=false;canvasWrap.inert=false;btnReadMap.setAttribute("aria-expanded","false");
  trayHandle.hidden=true;panelResizer.hidden=false;
 }
}
compactReader.addEventListener("change",()=>{
 const focusWasInPanel=readingPanel.contains(document.activeElement);
 const readerWasOpen=readerModalOpen;
 syncReaderLayout();
 readingReturnFocus=null;
 if(focusWasInPanel&&compactReader.matches)btnReadMap.focus();
 else if(readerWasOpen&&!compactReader.matches)readingPanel.focus();
});
/* the summon strip brings the surface back, whichever form factor it takes */
trayHandle.addEventListener("click",()=>{
 renderPanel(null);
 readingPanel.scrollTop=0;
 if(compactReader.matches)openReadingPanel(false);
 else{readingPanel.hidden=false;readingPanel.inert=false;trayHandle.hidden=true;readingPanel.focus({preventScroll:true});}
});
/* wide-mode reader width: drag the divider anywhere (16%–50% of the viewport); arrows step it */
let panelWidthPx: number | null=null;
function applyPanelWidth(px: number): void {
 const min=Math.max(320,innerWidth*0.16),max=innerWidth*0.5;
 panelWidthPx=Math.round(Math.min(max,Math.max(min,px)));
 document.documentElement.style.setProperty("--panel-w",panelWidthPx+"px");
 panelResizer.setAttribute("aria-valuenow",String(Math.round(panelWidthPx/innerWidth*100)));
}
panelResizer.addEventListener("pointerdown",ev=>{
 if(compactReader.matches)return;
 ev.preventDefault();panelResizer.setPointerCapture(ev.pointerId);panelResizer.classList.add("dragging");
 const startX=ev.clientX,startW=readingPanel.getBoundingClientRect().width;
 const move=(e: PointerEvent)=>applyPanelWidth(startW+(startX-e.clientX));
 const up=()=>{panelResizer.classList.remove("dragging");panelResizer.removeEventListener("pointermove",move);panelResizer.removeEventListener("pointerup",up);};
 panelResizer.addEventListener("pointermove",move);panelResizer.addEventListener("pointerup",up);
});
panelResizer.addEventListener("keydown",ev=>{
 if(compactReader.matches)return;
 const w=panelWidthPx??readingPanel.getBoundingClientRect().width;
 if(ev.key==="ArrowLeft"){ev.preventDefault();applyPanelWidth(w+24);}
 else if(ev.key==="ArrowRight"){ev.preventDefault();applyPanelWidth(w-24);}
});
window.addEventListener("resize",()=>{
 if(panelWidthPx!==null&&!compactReader.matches)applyPanelWidth(panelWidthPx);
 /* clamp a free-dragged sheet height if the window shrank under it */
 if(compactReader.matches&&readingPanel.classList.contains("free"))
  setSheetHeight(readingPanel.getBoundingClientRect().height);
});
syncReaderLayout();
btnReadMap.addEventListener("click",()=>{
 renderPanel(null);
 readingPanel.scrollTop=0; /* the headline leads; search never hijacks the scroll position */
 if(compactReader.matches)openReadingPanel(false);
 else readingPanel.focus({preventScroll:true});
});
/* the tray is non-modal: scrim clicks pass to the art; Escape rests the tray at peek */
const FOCUSABLE='button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])';
readingPanel.addEventListener("keydown",ev=>{
 if(ev.key!=="Tab"||!readerModalOpen)return;
 const controls=Array.from(readingPanel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el=>!el.closest("[inert]")&&el.offsetParent!==null);
 const first=controls[0],last=controls[controls.length-1];
 if(!first||!last)return;
 if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}
 else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}
});
const sheetGrabber=$<HTMLButtonElement>("sheetGrabber");
let suppressGrabberClick=false;
sheetGrabber.addEventListener("click",()=>{
 if(suppressGrabberClick){suppressGrabberClick=false;return;} /* a real drag ended on the grabber */
 if(!compactReader.matches||!readerModalOpen)return;
 setSheetDetent(sheetDetent==="peek"?"medium":sheetDetent==="medium"?"large":"medium");
});
/* X and drag-down put the tray away to its resting peek — it never vanishes without a way back */
$("closeReadingPanel").addEventListener("click",()=>setSheetDetent("peek"));
(function sheetDrag(){
 const css=getComputedStyle(readingPanel);
 const num=(name: string,fallback: number): number=>{const v=parseFloat(css.getPropertyValue(name));return Number.isFinite(v)?v:fallback;};
 const dismissVelocity=num("--dp-component-bottom-sheet-dismiss-velocity",0.5);
 const slop=num("--dp-component-bottom-sheet-drag-slop",4);
 let drag: { y: number; h: number; t: number; vy: number; moved: boolean } | null=null;
 /* drag the whole sheet head (grabber strip) to set any height; body keeps scrolling */
 sheetGrabber.addEventListener("pointerdown",ev=>{
  if(!compactReader.matches||!readerModalOpen)return;
  drag={y:ev.clientY,h:readingPanel.getBoundingClientRect().height,t:performance.now(),vy:0,moved:false};
  sheetGrabber.setPointerCapture(ev.pointerId);
 });
 sheetGrabber.addEventListener("pointermove",ev=>{
  if(!drag)return;
  const dy=ev.clientY-drag.y; /* up = taller, down = shorter */
  if(Math.abs(dy)>slop)drag.moved=true;
  drag.vy=dy/Math.max(1,performance.now()-drag.t);
  if(drag.moved){readingPanel.classList.add("is-dragging");setSheetHeight(drag.h-dy);}
 });
 const settle=(ev: PointerEvent)=>{
  if(!drag)return;
  const vy=drag.vy,moved=drag.moved;
  drag=null;readingPanel.classList.remove("is-dragging");
  if(!moved)return; /* below slop: let the click cycle the detent */
  suppressGrabberClick=true;
  ev.preventDefault();
  /* a hard flick down rests the tray at peek; otherwise it stays exactly where dropped */
  if(vy>dismissVelocity&&readingPanel.getBoundingClientRect().height<=detentHeight("medium"))setSheetDetent("peek");
 };
 sheetGrabber.addEventListener("pointerup",settle);
 sheetGrabber.addEventListener("pointercancel",()=>{if(drag){drag=null;readingPanel.classList.remove("is-dragging");}});
})();
function pin(id: string): void {
 if(pinned===id){pinned=null;NODES.forEach(n=>mark(n.id,false));renderPanel(null);updateNavigatorSelection();return;}
 pinned=id;NODES.forEach(n=>mark(n.id,n.id===id));
 openReadingPanel();
 flyTo(byId[id]);
 renderPanel(id);
 updateNavigatorSelection();
}

/* ————— the circuit: energized modules carry flow between each other —————
   Empty set = the whole board is live (the resting map). Click a module to
   energize it into the circuit; a connection carries flow only when BOTH of
   its ends are energized. Click an energized module to cut it — every flow
   through it dies. Click empty ground to restore the whole board. */
const cordon=new Set<string>(); /* energized modules; empty = all live */
let incidentActive=false;
function exitCordon(){cordon.clear();incidentActive=false;}
function paintCircuit(){
 const allLive=cordon.size===0;
 Object.entries(edgeLinesById).forEach(([k,o])=>{
  const e=k.split("-");
  const live=allLive||(cordon.has(e[0])&&cordon.has(e[1]));
  const m=o.line.material;
  m.opacity=live?baseOp(o):0;
  const base=o.type==="auth"?COL.accent:(o.health==="broken"?COL.risk:
    o.health==="degraded"?COL.caution:o.type==="intended"?mix(COL.fg1,COL.paper,0.45):COL.fg2);
  m.color.copy(live&&!allLive&&!o.health?COL.accent:base);
 });
 NODES.forEach(n=>{
  const on=allLive||cordon.has(n.id);
  const lb=$("lb-"+n.id);if(lb)lb.classList.toggle("dim",!on);
  mark(n.id,!allLive&&cordon.has(n.id));
  meshById[n.id].traverse((o: THREE.Object3D)=>{
    materialsOf(o).forEach((m: THREE.Material)=>{const r=Number(m.userData.op0??1);
      m.transparent=!on||r<1;m.opacity=on?r:(o instanceof THREE.Mesh?0.32:0.22);m.needsUpdate=true;});});
  /* advisory bands stay legible when deselected: a lighter veil, never erased */
  (advisoryById[n.id]||[]).forEach(p=>{
   p.material.uniforms.uMotion.value=on?1:0;
   p.material.uniforms.uVeil.value=on?0:1;
  });
  setMediaDim(n.id,on);
 });
}
function applyCircuit(){
 if(ti>=0){ti=-1;}
 paintCircuit();
 updateNavigatorSelection();
 refreshNowPlaying();
 if(cordon.size===0){renderPanel(null);return;}
 if(cordon.size===1){renderPanel([...cordon][0]);return;}
 renderCircuitPanel();
}
function renderCircuitPanel(){
 const live=[...cordon];
 const hot=Object.keys(edgeLinesById).filter(k=>{const e=k.split("-");return cordon.has(e[0])&&cordon.has(e[1]);});
 const cut=Object.keys(edgeLinesById).filter(k=>{const e=k.split("-");return cordon.has(e[0])!==cordon.has(e[1]);});
 pE.textContent="Circuit · "+live.length+" modules energized · "+hot.length+" link"+(hot.length!==1?"s":"")+" carrying flow";
 pT.textContent=live.map(i=>byId[i].name).join(" + ");
 pS.textContent=cut.length+" connection"+(cut.length!==1?"s":"")+" to dark modules — de-energized";
 let html="";
 live.forEach(i=>{const n=byId[i];
  html+="<p class='dp-type-body-sm'><strong>"+n.id+" &middot; "+n.name+"</strong> &mdash; "+
   (n.items&&n.items.length?(n.items.length+" open: "+n.items.map(it=>it.l).join("; ")):"clear")+"</p>";});
 if(hot.length){
  html+="<p class='dp-type-label-sm'>LIVE CONNECTIONS</p>";
  hot.forEach(k=>{const e=k.split("-"),o=edgeLinesById[k];
   html+="<p class='dp-type-body-sm'>"+byId[e[0]].name+" &rarr; "+byId[e[1]].name+
    " <span>("+(o.type==="auth"?"installs / authority":o.type==="intended"?"planned":"data")+(o.health?" &middot; "+o.health:"")+")</span>"+
    (TRACETEXT[k]?"<br><span>"+TRACETEXT[k]+"</span>":"")+"</p>";});
 }else{
  html+="<p class='dp-type-body-sm'>No closed segments yet &mdash; these modules have no direct connection. Energize the modules between them to complete the circuit.</p>";
 }
 html+="<p class='dp-type-body-sm'>Click an energized module to cut it; click empty ground to restore the whole board.</p>";
 setSafe(pP,html);
}
/* ————— legend ————— */
const legend=$<HTMLElement>("legend");
const moduleSearch=$<HTMLInputElement>("moduleSearch");
const moduleResults=$<HTMLElement>("moduleResults");
const moduleMore=$<HTMLButtonElement>("moduleMore");
const NAVIGATION_PAGE_SIZE=12;
let navigationNodes: Array<NavigationNode & { node: MapNode }> = [];
let navigationOffset=0;
function renderModuleNavigator(): void {
 const page=pageNavigation(GROUPS,navigationNodes,moduleSearch.value,navigationOffset,NAVIGATION_PAGE_SIZE);
 navigationOffset=page.start;
 const fragment=document.createDocumentFragment();
 for(const entry of page.groups){
  const section=document.createElement("section");section.className="module-group";
  const heading=document.createElement("h3");heading.className="dp-type-label-sm";heading.textContent=entry.group.label;
  const list=document.createElement("ul");list.className="dp-list";
  for(const result of entry.nodes){
   const node=result.node;
   const row=document.createElement("li");
   const button=document.createElement("button");button.type="button";button.className="dp-list-row dp-list-row--two-line";
   const selected=pinned===node.id||cordon.has(node.id);
   button.id="li-"+node.id;button.setAttribute("aria-pressed",String(selected));
   if(selected)button.classList.add("is-pressed");
   const text=document.createElement("span");text.className="dp-list-row__text";
   const title=document.createElement("span");title.className="dp-list-row__title";title.textContent=node.name;
   const secondary=document.createElement("span");secondary.className="dp-list-row__secondary";
   const itemCount=node.items?.length??0;secondary.textContent=`${node.id} · ${itemCount ? `${itemCount} open item${itemCount===1?"":"s"}` : "healthy"}`;
   text.append(title,secondary);button.append(text);
   button.addEventListener("click",()=>{pin(node.id);});
   row.append(button);list.append(row);
  }
  section.append(heading,list);fragment.append(section);
 }
 legend.replaceChildren(fragment);
 moduleResults.textContent=page.matchCount===0?"No sections or modules match this search.":`Showing ${page.start+1}–${page.end} of ${page.matchCount} modules`;
 moduleMore.hidden=page.nextOffset===null;
 moduleMore.dataset.nextOffset=page.nextOffset===null?"":String(page.nextOffset);
}
function updateNavigatorSelection(): void {
 for(const row of legend.querySelectorAll<HTMLButtonElement>(".dp-list-row")){
  const id=row.id.slice(3),selected=pinned===id||cordon.has(id);
  row.setAttribute("aria-pressed",String(selected));row.classList.toggle("is-pressed",selected);
 }
}
moduleSearch.addEventListener("input",()=>{navigationOffset=0;renderModuleNavigator();});
moduleMore.addEventListener("click",()=>{
 const next=Number(moduleMore.dataset.nextOffset);
 if(Number.isInteger(next)&&next>navigationOffset){navigationOffset=next;renderModuleNavigator();moduleMore.focus();}
});
/* ————— panel ————— */
const pE=$<HTMLElement>("pEyebrow"),pT=$<HTMLElement>("pTitle"),
      pS=$<HTMLElement>("pSub"),pP=$<HTMLElement>("pProse");
const DEF: { e: string; t: string; s: string; node: HTMLElement } = { e: "", t: "", s: "", node: document.createElement("div") };
function edgeTypeLabel(o: EdgeRuntime): string {return o.type==="auth"?"installs / authority":o.type==="intended"?"planned":"data flow";}
function renderEdgePanel(key: string): void {
 const o=edgeLinesById[key],e=key.split("-");
 const d=EDGEDOCS[key]||{};
 pE.textContent="LINK · "+edgeTypeLabel(o)+(o.health?" · "+o.health.toUpperCase():"");
 pT.textContent=d.title||(byId[e[0]].name+" → "+byId[e[1]].name);
 pS.textContent=byId[e[0]].id+" → "+byId[e[1]].id;
 let h="";
 if(d.carries)h+="<p class='dp-type-label'>What flows here</p><p class='dp-type-body-sm'>"+d.carries+"</p>";
 if(TRACETEXT[key])h+="<p class='dp-type-label'>In the loop</p><p class='dp-type-body-sm'>"+TRACETEXT[key]+"</p>";
 if(o.health==="degraded")h+="<p class='dp-type-body-sm'>Degraded: this link is live but impaired — flow runs slow.</p>";
 if(o.health==="broken")h+="<p class='dp-type-body-sm'>Broken: nothing crosses this link until it is repaired.</p>";
 if(o.type==="intended")h+="<p class='dp-type-body-sm'>Planned: this connection does not exist yet — it lands with the work in flight.</p>";
 /* links inherit sensors from their endpoints: a crossing is observed when either end is instrumented */
 const sens=e.filter(id=>TELEMETRY[id]).map(id=>id+" &middot; "+TELEMETRY[id].trace_boundary);
 if(sens.length)h+="<p class='dp-type-label'>Sensors at the ends</p><p class='dp-type-body-sm'>"+sens.join("<br>")+"</p>";
 if(d.refs)h+="<p class='refs dp-type-code'>"+d.refs+"</p>";
 if(!h)h="<p class='dp-type-body-sm'>"+byId[e[0]].name+" connects to "+byId[e[1]].name+".</p>";
 setSafe(pP,h);
}
function renderPanel(id: string | null): void {
 if(!id){
  /* overview: what this is + the whole board's state, one scroll — no hidden mode */
  pE.textContent=DEF.e;pT.textContent=DEF.t||"Overview";pS.textContent=DEF.s;
  const c=DEF.node.cloneNode(true);
  while(pP.firstChild)pP.removeChild(pP.firstChild);
  while(c.firstChild)pP.appendChild(c.firstChild);
  const reds=NODES.reduce((a,n)=>a+n.items.filter(i=>i.c==="red").length,0);
  const yours=NODES.reduce((a,n)=>a+n.items.filter(i=>i.c==="you").length,0);
  const amber=NODES.reduce((a,n)=>a+n.items.filter(i=>i.c==="amber").length,0);
  let h="<p class='dp-type-label-sm'>SYSTEM STATE &middot; "+reds+" BLOCKER &middot; "+yours+" YOUR CALL &middot; "+amber+" QUEUED</p>";
  const sev=(i: Item): number=>i.c==="red"?0:i.c==="you"?1:2;
  NODES.filter(n=>n.items&&n.items.length).sort((a,b)=>Math.min(...a.items.map(sev))-Math.min(...b.items.map(sev))).forEach(n=>{
   h+="<div class='cond dp-type-body-xs'><span class='dp-type-label-sm'>"+n.id+" &middot; "+n.name+"</span><br>";
   n.items.forEach(it=>{h+="<span class='pip "+(it.c==="you"?"you":it.c)+"'></span>"+(it.c==="you"?"YOUR CALL &mdash; ":"")+it.l+"<br>";});
   h+="</div>";
  });
  const tail=new DOMParser().parseFromString("<div>"+h+"</div>","text/html").body.firstElementChild;
  if(tail)while(tail.firstChild)pP.appendChild(document.adoptNode(tail.firstChild));
  return;
 }
 const n=byId[id];
 pE.textContent=n.id+" · "+(GROUPS.find(g=>g.id===n.g)?.label ?? n.g);
 pT.textContent=n.name;
 pS.textContent=(n.items&&n.items.length)?(n.items.length+" open item"+(n.items.length>1?"s":"")):"healthy · nothing open";
 /* one column: identity → state → evidence. Everything visible, nothing behind a mode. */
 let h="<p class='dp-type-body-sm'>"+n.does+"</p>";
 h+="<p class='dp-type-label-sm'>STATE</p>";
 h+="<p class='dp-type-body-sm'>"+n.built+"</p>";
 if(n.items&&n.items.length){
  h+="<div class='cond dp-type-body-xs'><span class='dp-type-label-sm'>Open items ("+n.items.length+")</span><br>";
  n.items.forEach(it=>{h+="<span class='pip "+(it.c==="you"?"you":it.c)+"'></span>"+(it.c==="you"?"YOUR CALL &mdash; ":"")+it.l+"<br>";});
  h+="</div>";}
 if(n.good)h+="<div class='good dp-type-body-xs'><span class='dp-type-label-sm'>Feedback credit</span><br>"+n.good+"</div>";
 if(n.cond)h+="<div class='cond dp-type-body-xs'><span class='dp-type-label-sm'>Open condition</span><br>"+n.cond+"</div>";
 h+=sensorBlock(n.id);
 h+="<p class='dp-type-label-sm'>EVIDENCE</p>";
 h+="<p class='refs'>"+n.refs+"</p>";
 setSafe(pP,h);
}

/* ————— flow + trace ————— */
let flowing=false; /* the map opens still — pressing Flow is the reveal */
const btnFlow=$<HTMLButtonElement>("btnFlow");
btnFlow.addEventListener("click",()=>{
 flowing=!flowing;if(RM)flowing=false;
 btnFlow.setAttribute("aria-pressed",String(flowing));
 setCanonicalIcon(btnFlow,flowing?iconStop:iconPlay);
});
const btnStack=$<HTMLButtonElement>("btnStack");
btnStack.addEventListener("click",()=>{
 stacked=!stacked;
 btnStack.setAttribute("aria-pressed",String(stacked));
 NODES.forEach(n=>{n._lyT=stacked?n._lvl*LVL_H:0;});
 makeGrid();
 rebuildDotsAfterLevelMotion=true;
 brushReliftPending=true; /* strokes ride their module to its new level */
});
/* the ground grid is a reading aid, not a fixture — a toggle turns it off for a clean page */
const btnGrid=$<HTMLButtonElement>("btnGrid");
let gridOn=true;
btnGrid.addEventListener("click",()=>{
 gridOn=!gridOn;
 btnGrid.setAttribute("aria-pressed",String(gridOn));
 grids.forEach(g=>{g.visible=gridOn;});
});
let ti=-1;
function clearTrace(){
 ti=-1;
 NODES.forEach(n=>{const lb=$("lb-"+n.id);if(lb)lb.classList.remove("dim");
   meshById[n.id].traverse((o: THREE.Object3D)=>{materialsOf(o).forEach((m: THREE.Material)=>{const r=Number(m.userData.op0??1);m.transparent=r<1;m.opacity=r;m.needsUpdate=true;});});});
 Object.values(edgeLinesById).forEach(o=>{o.line.material.opacity=baseOp(o);});
 NODES.forEach(n=>mark(n.id,false));
 if(!pinned)renderPanel(null);
}
function renderTrace(){
 const cur=TRACE[ti],ends=cur.split("-");
 Object.entries(edgeLinesById).forEach(([k,o])=>{o.line.material.opacity=(k===cur)?1:0.06;});
 NODES.forEach(n=>{
   const on=ends.indexOf(n.id)>=0;
   const lb=$("lb-"+n.id);if(lb)lb.classList.toggle("dim",!on);
   meshById[n.id].traverse((o: THREE.Object3D)=>{materialsOf(o).forEach((m: THREE.Material)=>{const r=Number(m.userData.op0??1);
       m.transparent=!on||r<1;m.opacity=on?r:(o instanceof THREE.Mesh?0.08:0.05);m.needsUpdate=true;});});
   mark(n.id,on);});
 pinned=null;
 pE.textContent="Step "+(ti+1)+" of "+TRACE.length;
 pT.textContent=byId[ends[0]].name+" → "+byId[ends[1]].name;
 pS.textContent="trace one step";
 setSafe(pP,"<p class='dp-type-body-sm'>"+TRACETEXT[cur]+"</p>");
}
$("btnTrace").addEventListener("click",()=>{
 exitCordon();
 if(!TRACE.length)return;
 ti=(ti+1)%TRACE.length;renderTrace();
});

/* Themes are the complete canonical manifest, shown in reverse source order. */
const THEMES=presentedThemes;
function refreshTheme(): void {
 computePalette();scene.background=COL.paper.clone();ambient.color.copy(COL.paper);sun.color.copy(COL.paper);fill.color.copy(COL.paper);makeGrid();
 themed.forEach(t=>{if(t.m.color){t.m.color.copy(t.get());t.m.needsUpdate=true;}});
 hatched.forEach(h=>{const old=h.m.map;h.m.map=makeHatch(h.st);h.m.needsUpdate=true;if(old)old.dispose();});
 /* advisory gradients repaint from the live theme */
 computeAdvisory();
 NODES.forEach(n=>{
  const planes=advisoryById[n.id]||[];
  if(!planes.length)return;
  const cats=Array.from(new Set((n.items||[]).map(i=>i.c).filter(c=>ADVISORY_FILL[c])));
  planes.forEach(p=>{
   const cols: THREE.Color[]=[];
   cats.forEach(c=>{cols.push(ADVISORY[c].wash);});
   cats.forEach(c=>{cols.push(ADVISORY[c].deep);});
   p.material.uniforms.uColors.value=[cols[0],cols[1]??cols[0],cols[2]??cols[cols.length-1]??cols[0]];
   p.material.uniforms.uCount.value=Math.min(3,cols.length);
  });
 });
 paintCircuit();
 /* your sketches take the new pencil on a theme change */
 try{brush.repaint();}catch(e){if(e instanceof ReferenceError){/* not yet initialised on first build */}else throw e;}
 /* browser chrome follows the canvas (token color.chrome.theme = bg-canvas) */
 const chromeMeta=document.querySelector('meta[name="theme-color"]');
 if(chromeMeta)chromeMeta.setAttribute("content","#"+COL.paper.getHexString());
}
function setTheme(id: ThemeId,mode: Mode=activeMode): void {
 activeTheme=id;activeMode=mode;setDPTheme(id);setDPMode(mode);
 try{localStorage.setItem("isoscope.dp.theme",id);localStorage.setItem("isoscope.dp.mode",mode);}catch{}
 refreshTheme();paintThemeRows();
}
const drawer=$<HTMLElement>("drawer");
const settingsButton=$<HTMLButtonElement>("btnSettings");
const workbench=$<HTMLElement>("workbench");
const settingsBackdrop=$<HTMLElement>("settingsBackdrop");
function closeSettings(): void {
 drawer.classList.remove("open");drawer.hidden=true;drawer.inert=true;
 settingsBackdrop.hidden=true;
 workbench.inert=false;settingsButton.setAttribute("aria-expanded","false");settingsButton.focus();
}
settingsButton.addEventListener("click",()=>{
 const open=!drawer.classList.contains("open");
 if(open){
  if(readerModalOpen)closeReadingPanel(); /* layers are exclusive: one surface at a time */
  settingsBackdrop.hidden=false;drawer.hidden=false;drawer.inert=false;workbench.inert=true;drawer.classList.add("open");settingsButton.setAttribute("aria-expanded","true");$("drawerClose").focus();
 }
 else closeSettings();
});
$("drawerClose").addEventListener("click",closeSettings);
settingsBackdrop.addEventListener("click",closeSettings);
drawer.addEventListener("keydown",ev=>{
 if(ev.key!=="Tab")return;
 const focusable=Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el=>el.offsetParent!==null);
 const first=focusable[0],last=focusable[focusable.length-1];
 if(!first||!last)return;
 if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}
 else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}
});
/* one Escape contract for the whole app: close the topmost open layer, from anywhere */
document.addEventListener("keydown",ev=>{
 if(ev.key!=="Escape")return;
 if(drawer.classList.contains("open")){ev.preventDefault();closeSettings();}
 else if(readerModalOpen){ev.preventDefault();setSheetDetent("peek");}
});
const themeList=$<HTMLElement>("themeList");
const modeSelect=$<HTMLSelectElement>("modeSelect");
modeSelect.value=activeMode;
modeSelect.addEventListener("change",()=>setTheme(activeTheme,modeSelect.value as Mode));
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{if(activeMode==="system")refreshTheme();});
function paintThemeRows(): void {
 themeList.querySelectorAll<HTMLButtonElement>(".trow").forEach(button=>{
  button.setAttribute("aria-pressed",String(button.dataset.id===activeTheme));
 });
}
THEMES.forEach(theme=>{
 const button=document.createElement("button");button.type="button";button.className="trow";
 button.dataset.id=theme.id;button.setAttribute("aria-label",`${theme.name} theme`);
 const swatch=document.createElement("span");swatch.className="swatch theme-swatch";swatch.setAttribute("aria-hidden","true");
 swatch.setAttribute("data-dp-theme",theme.id); /* themes nest: the swatch previews its own palette in the current mode */
 const label=document.createElement("span");label.className="nm";label.textContent=theme.name;
 button.append(swatch,label);button.addEventListener("click",()=>setTheme(theme.id));themeList.append(button);
});
$("btnRandomTheme").addEventListener("click",()=>{
 const pool=THEMES.filter(t=>t.id!==activeTheme);if(pool.length)setTheme(pool[Math.floor(Math.random()*pool.length)].id);
});
paintThemeRows();
const dashSeg=$<HTMLElement>("dashSeg");
DOTSETS.forEach((p,i)=>{
 const b=document.createElement("button");b.type="button";b.textContent=p.label;
 b.setAttribute("aria-pressed",String(i===dotSet)); /* canonical segmented state: styling and AT agree */
 b.addEventListener("click",()=>{
  dotSet=i;
  Object.values(edgeLinesById).forEach(o=>buildDots(o));
  dashSeg.querySelectorAll("button").forEach((x,xi)=>x.setAttribute("aria-pressed",String(xi===i)));
 });
 dashSeg.appendChild(b);
});
const weightSeg=$<HTMLElement>("weightSeg");
LINEW.forEach((p,i)=>{
 const b=document.createElement("button");b.type="button";b.textContent=p.label;
 b.setAttribute("aria-pressed",String(i===lineSet));
 b.addEventListener("click",()=>{
  lineSet=i;
  edgeMats.forEach(m=>{m.linewidth=p.w;});
  const sc=junctionScale();
  Object.values(edgeLinesById).forEach(o=>{buildDots(o);o.jn.forEach(j=>j.scale.set(sc,1,sc));});
  weightSeg.querySelectorAll("button").forEach((x,xi)=>x.setAttribute("aria-pressed",String(xi===i)));
 });
 weightSeg.appendChild(b);
});
/* pen thickness is a module-level setting (the brush reads it lazily); a stable
    constant, declared here so the segmented control can be built before the brush */
const PENW=[{label:"Fine",w:1.5},{label:"Medium",w:3},{label:"Bold",w:5.5}];
let penWIndex=1;
const penSeg=$<HTMLElement>("penSeg");
PENW.forEach((p,i)=>{
 const b=document.createElement("button");b.type="button";b.textContent=p.label;
 b.setAttribute("aria-pressed",String(i===penWIndex)); /* Medium is the resting nib */
 b.addEventListener("click",()=>{
  penWIndex=i;
  penSeg.querySelectorAll("button").forEach((x,xi)=>x.setAttribute("aria-pressed",String(xi===i)));
 });
 penSeg.appendChild(b);
});
$("btnGuide").addEventListener("click",()=>{
 closeSettings();
 const movement=document.getElementById("movementDetails");
 if(movement instanceof HTMLDetailsElement)movement.open=true;
 if(compactReader.matches)openReadingPanel(false);
 requestAnimationFrame(()=>document.querySelector<HTMLElement>("#movementDetails > summary")?.focus());
});

/* R30: rebuild only graph-owned resources; closures retain their collections. */
function buildScene(spec: Spec): void{
 document.title=spec.title||"Isoscope";
 $("metricStrip").replaceChildren();
 NODES.forEach(n=>{
  const st=STATUS[n.id]||{state:"ok",items:[]};n.items=st.items||[];
  n.st=n.items.some(i=>i.c==="red")?"blocked":(st.state ?? "ok");
  n._lvl=LEVELS[n.id]||0;n._lyT=stacked?n._lvl*LVL_H:0;n._ly=n._lyT;
  byId[n.id]=n;
 });
/* chrome from spec: keep the identity lockup's mark, only the name is authored */
const brandName=$("brandV").querySelector(".brand-name");
if(brandName)brandName.textContent="Isoscope";
(spec.metrics||[]).forEach((mt)=>{
 const c=document.createElement("div");c.className="cell";
 const k=document.createElement("span");k.className="k dp-type-label-sm";k.textContent=mt.k;
 const v=document.createElement("span");v.className="v dp-type-data-head";v.textContent=mt.v;
 c.appendChild(k);c.appendChild(v);$("metricStrip").appendChild(c);
});
$("asOf").textContent=spec.asOf||"";
const dec=(t: string | undefined): string=>new DOMParser().parseFromString("<x>"+(t||"")+"</x>","text/html").documentElement.textContent ?? "";
$("pEyebrow").textContent=dec((spec.intro||{}).eyebrow);
$("pTitle").textContent=dec((spec.intro||{}).title);
$("pSub").textContent=dec((spec.intro||{}).sub);

NODES.forEach(n=>{
 const grp=new THREE.Group();grp.userData.id=n.id;
 /* etched, poster-flat, simple: paper roof + hatched sides, no base plate */
 const side=new THREE.MeshBasicMaterial({map:makeHatch(n.st)});
 hatched.push({m:side,st:n.st});
 const roof=new THREE.MeshBasicMaterial({color:ROOF[n.st]});
 themed.push({m:roof,get:()=>ROOF[n.st]});
 const cx=n.x+n.w/2,cz=n.y+n.d/2;
 const w=worstOf(n);
 function box(h0: number,hh: number): void{
   const geo=new THREE.BoxGeometry(n.w,hh,n.d);
   const m=new THREE.Mesh(geo,[side,side,roof,side,side,side]);
   m.position.set(cx,h0+hh/2,cz);m.userData.id=n.id;
   grp.add(m);pickables.push(m);
   const egm=new THREE.LineBasicMaterial({color:COL.fg1,transparent:true,opacity:1});
   themed.push({m:egm,get:()=>COL.fg1});
   const eg=new THREE.LineSegments(new THREE.EdgesGeometry(geo),egm);
   eg.position.copy(m.position);grp.add(eg);
 }
 if(n.stack){const sh=n.h/n.stack,gap=sh*0.25;
   for(let i=0;i<n.stack;i++)box(i*(sh+gap)*0.8,sh);}
 else box(0,n.h);
 scene.add(grp);meshById[n.id]=grp;
 refreshAdvisory(n);
 refreshSurfaces(n);
 /* placard */
 const lb=document.createElement("div");lb.className="lbl";lb.id="lb-"+n.id;
 const idsp=document.createElement("span");idsp.className="id";idsp.textContent=n.id;
 lb.appendChild(idsp);lb.appendChild(document.createTextNode(SHORT[n.id]||n.name));
 if(n.items&&n.items.length){
   const sfx=document.createElement("span");sfx.className="sfx "+w;
   sfx.textContent="· "+n.items.length+" open"+(n.items.some(i=>i.c==="you")?" · yours":"");
   lb.appendChild(sfx);
 }
 lblLayer.appendChild(lb);
 n._anchor=new THREE.Vector3(cx,0,n.y+n.d+0.35);
});

/* resting opacity of every material (faces AND ink outlines) for honest trace-dimming */
NODES.forEach(n=>meshById[n.id].traverse((o: THREE.Object3D)=>{
 materialsOf(o).forEach((m: THREE.Material)=>{m.userData.op0=m.opacity;});}));


 NODES.forEach(n=>meshById[n.id].position.y=n._ly);
 Object.assign(__ROUTED,isoRouteAll(NODES,EDGES));window.__isoRouteQC=__ROUTED.qc;
EDGES.forEach(e=>{
 const key=e[0]+"-"+e[1];
 const health=EDGESTATUS[key]||null;
 const basePts=edgePath(e);
 /* ALL SOLID: color + weight carry the semantics — no dashes anywhere.
    planned = faint · degraded = amber · broken = red and never carries flow */
 let mat,dotted=true,speed=1;
 if(health==="broken"){mat=edgeMat(()=>COL.risk,0.95);dotted=false;}
 else if(health==="degraded"){mat=edgeMat(()=>COL.caution,0.9);speed=0.45;}
 else if(e[2]==="auth"){mat=edgeMat(()=>COL.accent,0.95);}
 else if(e[2]==="intended"){mat=edgeMat(()=>mix(COL.fg1,COL.paper,0.45),0.4);speed=0.35;}
 else{mat=edgeMat(()=>COL.fg2,0.75);}
 const line=new Line2(new LineGeometry(),mat);
 line.userData.edgeKey=key;
 scene.add(line);
 edgeLinesById[key]={key,line,type:e[2] ?? "data",health,basePts,a:e[0],b:e[1],dotted,speed,t:0,dots:[],pts:[],L:[0],total:1,jn:[junctionMesh(),junctionMesh()]};
});

 themed.push({m:dotMatN,get:()=>COL.accent},{m:dotMatW,get:()=>COL.caution});
 rebuildAllEdges();
 navigationNodes=NODES.map(node=>({id:node.id,name:node.name,groupId:node.g,node}));
 renderModuleNavigator();


 setSafe(pP,(spec.intro||{}).proseHTML||"");
 Object.assign(DEF,{e:pE.textContent,t:pT.textContent,s:pS.textContent,node:pP.cloneNode(true)});
 window.__lblMeasured=false;
}
function disposeScene(){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 Object.values(meshById).forEach(g=>{
  g.traverse((o: THREE.Object3D)=>{if(o instanceof THREE.Mesh || o instanceof THREE.Line)geometries.add(o.geometry);
   materialsOf(o).forEach((m: THREE.Material)=>materials.add(m));});
  scene.remove(g);
 });
 hatched.forEach(h=>{if(h.m.map)textures.add(h.m.map);});
 Object.values(edgeLinesById).forEach(o=>{
  o.dots.forEach(d=>{scene.remove(d);geometries.add(d.geometry);});
  scene.remove(o.line);geometries.add(o.line.geometry);materials.add(o.line.material);
  o.jn.forEach(j=>{scene.remove(j);materials.add(j.material);});
 });
 geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
 pickables.length=0;themed.length=0;hatched.length=0;edgeMats.length=0;
 Object.keys(surfacesById).forEach(id=>{const faces=surfacesById[id];Object.values(faces).forEach(e=>e&&e.dispose());delete surfacesById[id];});
 syncSoundButton();
 Object.keys(advisoryById).forEach(k=>delete advisoryById[k]);
 [meshById,edgeLinesById,byId].forEach(m=>Object.keys(m).forEach(k=>delete m[k]));
 lblLayer.replaceChildren();legend.replaceChildren();
}
function blastIncident(){
 const reds=NODES.filter(n=>n.items.some(i=>i.c==="red"));
 if(!reds.length)return;
 reds.sort((a,b)=>b.items.filter(i=>i.c==="red").length-a.items.filter(i=>i.c==="red").length);
 cordon.clear();reds.forEach(n=>cordon.add(n.id));
 EDGES.forEach(e=>{if(reds.some(n=>n.id===e[0]))cordon.add(e[1]);if(reds.some(n=>n.id===e[1]))cordon.add(e[0]);});
 incidentActive=true;pinned=null;selEdge=null;ti=-1;paintCircuit();
 const worst=reds[0];renderPanel(worst.id);pE.textContent="Incident · "+worst.id;
 flyTo(worst);
 flyGoal = { ...(flyGoal ?? { tx: HOME.tx, ty: HOME.ty, tz: HOME.tz, zoom: HOME.zoom }), tx: worst._anchor.x, ty: worst._lyT, tz: worst._anchor.z };
}
function applySpec(next: Spec): void{
 // Clone before clearing: callers may supply objects aliased to the active spec.
 next=structuredClone(next);
 if(!Array.isArray(next.nodes)||!Array.isArray(next.edges)||!Array.isArray(next.groups))throw Error("invalid live spec");
 const ids=new Set<string>(next.nodes.map((n: MapNode)=>n.id));
 if(ids.size!==next.nodes.length||next.edges.some((e: EdgeTuple)=>!ids.has(e[0])||!ids.has(e[1])))throw Error("invalid live graph");
 const oldReds=new Set(NODES.filter(n=>n.items.some(i=>i.c==="red")).map(n=>n.id));
 const replace=(target: unknown,value: unknown): void=>{
  if(Array.isArray(target)){target.splice(0,target.length,...(Array.isArray(value)?value:[]));return;}
  if(target&&typeof target==="object"){
   const record=target as Record<string,unknown>;
   Object.keys(record).forEach(k=>delete record[k]);
   if(value&&typeof value==="object")Object.assign(record,value);
  }
 };
 disposeScene();
 const replacements: Array<readonly [unknown,unknown]> = [
  [NODES,next.nodes],[EDGES,next.edges],[GROUPS,next.groups],[STATUS,next.status],[SHORT,next.short],
  [EDGEDOCS,next.edgeDocs],[EDGESTATUS,next.edgeStatus],[TELEMETRY,next.telemetry],[LEVELS,next.levels],
  [TRACE,next.trace],[TRACETEXT,next.traceText]
 ];
 replacements.forEach(entry=>replace(entry[0],entry[1]));
 replace(SPEC,next);
 Object.assign(SPEC,{nodes:NODES,edges:EDGES,groups:GROUPS,status:STATUS,short:SHORT,edgeDocs:EDGEDOCS,
  edgeStatus:EDGESTATUS,telemetry:TELEMETRY,levels:LEVELS,trace:TRACE,traceText:TRACETEXT});
 Object.assign(_bb,NODES.length?{
  x0:Math.min(...NODES.map(n=>n.x)),x1:Math.max(...NODES.map(n=>n.x+n.w)),
  z0:Math.min(...NODES.map(n=>n.y)),z1:Math.max(...NODES.map(n=>n.y+n.d))}:{x0:-1,x1:1,z0:-1,z1:1});
 Object.assign(CENTER,{x:(_bb.x0+_bb.x1)/2,z:(_bb.z0+_bb.z1)/2});
 FITSPAN=Math.max(_bb.x1-_bb.x0,_bb.z1-_bb.z0);VIEW=Math.max(16,FITSPAN*1.25+3);
 Object.assign(HOME,{tx:CENTER.x,tz:CENTER.z});
 if(pinned&&!ids.has(pinned))pinned=null;
 [...cordon].forEach(id=>{if(!ids.has(id))cordon.delete(id);});
 if(selEdge&&!EDGES.some(e=>e[0]+"-"+e[1]===selEdge))selEdge=null;
 if(ti>=TRACE.length||ti<0||!EDGES.some(e=>e[0]+"-"+e[1]===TRACE[ti]))ti=-1;
 hoverId=null;flyGoal=null;
 buildScene(SPEC);refreshTheme();resize();
 brush.clear(); /* a new map is a new page; old sketches don't carry over */
 const reds=NODES.filter(n=>n.items.some(i=>i.c==="red"));
 if(reds.some(n=>!oldReds.has(n.id))){blastIncident();return;}
 if(incidentActive&&!reds.length){cordon.clear();incidentActive=false;}
 paintCircuit();
 if(selEdge)selectEdge(selEdge);
 else if(pinned){NODES.forEach(n=>mark(n.id,n.id===pinned));renderPanel(pinned);}
 else if(cordon.size)renderCircuitPanel();
 else if(ti>=0)renderTrace();
 else renderPanel(null);
 if(controls.target.x<_bb.x0-1||controls.target.x>_bb.x1+1||controls.target.z<_bb.z0-1||controls.target.z>_bb.z1+1)
  flyGoal={tx:HOME.tx,ty:HOME.ty,tz:HOME.tz,zoom:HOME.zoom,az:HOME.az,pol:HOME.pol};
}
buildScene(SPEC);
renderPanel(null);
blastIncident();

/* ————— the brush (static ink you own, drawn in the object's space) —————
   Toggle Draw (or press W) and orbit/pick are suspended. With a module selected
   (pinned, or a single energized one), strokes land on THAT module's plane:
   orbit near top-down and you draw flat on its level; orbit to edge-on and you
   draw vertical on the face you are looking at. The camera polar angle at the
   moment you start the stroke picks the plane. With nothing selected it falls
   back to the ground plane. Strokes persist, ride Stack lifts, undo one at a
   time, and clear from Settings. Ink is the primary text color with a whisper
   of accent — a pencil line, quiet and on-brand. */
const brush=(()=>{
 const group=new THREE.Group();group.renderOrder=4;scene.add(group);
 /* strokes are fat lines (true pixel width) so pen thickness is a real, variable
    setting, matching the edge rendering. A stroke drawn on a module conforms to
    its surfaces; one drawn with nothing selected lies on the ground plane. */
 type Stroke={line: Line2; mat: LineMaterial; pts: THREE.Vector3[]; target: string | null; baseY: number};
 const strokes: Stroke[]=[];
 let active=false;let drawing=false;let current: Stroke | null=null;
 const btnDraw=$<HTMLButtonElement>("btnDraw");
 const count=$<HTMLElement>("drawCount");
 const hitP=new THREE.Vector3();
 const brushMats: LineMaterial[]=[];
 /* the module a stroke belongs to: the pinned one, else the single energized one */
 function target(): MapNode | null {
  if(pinned&&byId[pinned]&&meshById[pinned])return byId[pinned];
  if(cordon.size===1){const n=byId[[...cordon][0]];if(n&&meshById[n.id])return n;}
  return null;
 }
 function setRay(cx: number,cy: number): void {
  const r=canvas.getBoundingClientRect();
  ptr.x=((cx-r.left)/r.width)*2-1;ptr.y=-((cy-r.top)/r.height)*2+1;
  ray.setFromCamera(ptr,camera);
  ray.camera=camera;
 }
 /* ON the object: raycast the selected module's meshes and lay the point on
    whatever face the pointer crosses (roof or wall), nudged proud of the surface
    so it reads. This is conformal drawing — the ink hugs the box. */
 function onObject(n: MapNode,cx: number,cy: number): THREE.Vector3 | null {
  const grp=meshById[n.id];if(!grp)return null;
  setRay(cx,cy);
  const meshes: THREE.Object3D[]=[];
  grp.traverse((o: THREE.Object3D)=>{if(o instanceof THREE.Mesh&&o.userData.id===n.id)meshes.push(o);});
  const hit=ray.intersectObjects(meshes,false);
  if(!hit.length)return null;
  const h=hit[0];
  const nrm=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):new THREE.Vector3(0,1,0);
  return h.point.clone().addScaledVector(nrm,0.02);
 }
 /* AROUND the object (missed the mesh): fall back to a working plane through the
    module, chosen by camera polar angle — top-down draws flat on its level,
    edge-on draws vertical on the facing side. */
 const FLAT_LIMIT=0.86;
 function aroundPlane(n: MapNode,cx: number,cy: number): THREE.Vector3 | null {
  const off=camera.position.clone().sub(controls.target);
  const sph=new THREE.Spherical().setFromVector3(off);
  const base=n._ly||0;
  let plane: THREE.Plane;
  if(sph.phi<FLAT_LIMIT)plane=new THREE.Plane(new THREE.Vector3(0,1,0),-base);
  else{
   const normal=new THREE.Vector3(Math.sin(sph.theta),0,Math.cos(sph.theta)).normalize();
   plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,new THREE.Vector3(n.x+n.w/2,base+n.h/2,n.y+n.d/2));
  }
  setRay(cx,cy);
  return ray.ray.intersectPlane(plane,hitP)?hitP.clone():null;
 }
 const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
 function toSurface(cx: number,cy: number): THREE.Vector3 | null {
  const n=target();
  if(n){const on=onObject(n,cx,cy);if(on)return on;return aroundPlane(n,cx,cy);}
  setRay(cx,cy);
  return ray.ray.intersectPlane(groundPlane,hitP)?hitP.clone():null;
 }
 function ink(): THREE.Color { return mix(COL.fg1,COL.accent,0.22); }
 function syncCount(){count.textContent=strokes.length+" stroke"+(strokes.length===1?"":"s");}
 function makeMat(): LineMaterial {
  const m=new LineMaterial({color:ink().getHex(),transparent:true,opacity:0.92,linewidth:PENW[penWIndex].w});
  m.resolution.set(wrap.clientWidth,wrap.clientHeight);
  brushMats.push(m);
  return m;
 }
 function geomFrom(pts: THREE.Vector3[]): LineGeometry {
  const flat: number[]=[];pts.forEach(p=>flat.push(p.x,p.y,p.z));
  const g=new LineGeometry();g.setPositions(flat);return g;
 }
 function begin(cx: number,cy: number): void {
  const n=target();
  const p=toSurface(cx,cy);if(!p)return;
  const mat=makeMat();
  const line=new Line2(geomFrom([p]),mat);
  line.computeLineDistances();
  group.add(line);
  current={line,mat,pts:[p],target:n?n.id:null,baseY:n?(n._ly||0):0};drawing=true;
 }
 function extend(cx: number,cy: number): void {
  if(!drawing||!current)return;
  const p=toSurface(cx,cy);if(!p)return;
  const last=current.pts[current.pts.length-1];
  if(last.distanceToSquared(p)<0.0009)return; /* ignore sub-pixel jitter */
  current.pts.push(p);
  current.line.geometry.dispose();
  current.line.geometry=geomFrom(current.pts);
  current.line.computeLineDistances();
 }
 function end(): void {
  if(!drawing||!current)return;
  drawing=false;
  if(current.pts.length>1){strokes.push(current);syncCount();}
  else{group.remove(current.line);current.line.geometry.dispose();current.mat.dispose();brushMats.splice(brushMats.indexOf(current.mat),1);}
  current=null;
 }
 function setActive(on: boolean): void {
  active=on;
  btnDraw.setAttribute("aria-pressed",String(on));
  controls.enabled=!on; /* drawing owns the pointer; orbit resumes when you lift the pen */
  canvas.style.cursor=on?"crosshair":"";
  if(!on)end();
 }
 function drop(s: Stroke): void {
  group.remove(s.line);s.line.geometry.dispose();s.mat.dispose();
  const i=brushMats.indexOf(s.mat);if(i>=0)brushMats.splice(i,1);
 }
 function undo(): void { const s=strokes.pop();if(!s)return;drop(s);syncCount(); }
 function clear(): void { while(strokes.length){const s=strokes.pop();if(!s)break;drop(s);}syncCount(); }
 function repaint(): void { const c=ink();strokes.forEach(s=>{s.mat.color.copy(c);}); }
 function resizeAll(): void { brushMats.forEach(m=>m.resolution.set(wrap.clientWidth,wrap.clientHeight)); }
 /* strokes bound to a module ride it when Stack lifts the levels */
 function relift(): void {
  strokes.forEach(s=>{
   if(!s.target||!byId[s.target])return;
   const n=byId[s.target];const dy=(n._ly||0)-s.baseY;
   if(Math.abs(dy)<1e-4)return;
   s.pts.forEach(p=>{p.y+=dy;});s.baseY=n._ly||0;
   s.line.geometry.dispose();s.line.geometry=geomFrom(s.pts);s.line.computeLineDistances();
  });
 }
 btnDraw.addEventListener("click",()=>setActive(!active));
 $("btnDrawUndo").addEventListener("click",undo);
 $("btnDrawClear").addEventListener("click",clear);
 canvas.addEventListener("pointerdown",ev=>{if(active&&ev.button===0){ev.preventDefault();begin(ev.clientX,ev.clientY);}},true);
 canvas.addEventListener("pointermove",ev=>{if(active)extend(ev.clientX,ev.clientY);},true);
 window.addEventListener("pointerup",()=>{if(active)end();},true);
 syncCount();
 return {setActive,undo,clear,repaint,relift,resizeAll,isActive:()=>active};
})();

/* ————— frame loop ————— */
function resize(){
 const w=wrap.clientWidth,h=wrap.clientHeight;
 renderer.setSize(w,h,false);
 edgeMats.forEach(m=>m.resolution.set(w,h));
 brush.resizeAll(); /* fat-line strokes need the live resolution too */
 const a=w/h;camera.left=-VIEW*a/2;camera.right=VIEW*a/2;camera.top=VIEW/2;camera.bottom=-VIEW/2;
 camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(wrap);resize();
const tmpV=new THREE.Vector3();window.__lblTick=0;
function tick(){
 requestAnimationFrame(tick);
 if(flyGoal){ /* autopilot: glide target+distance; any user gesture cancels */
   const k=RM?1:0.10;
   controls.target.x+=(flyGoal.tx-controls.target.x)*k;
   controls.target.y+=(flyGoal.ty-controls.target.y)*k;
   controls.target.z+=(flyGoal.tz-controls.target.z)*k;
   const nz=camera.zoom+(flyGoal.zoom-camera.zoom)*k;
   camera.zoom=nz;camera.updateProjectionMatrix();
   let angDone=true;
   if(flyGoal&&flyGoal.az!==undefined){
     const off=camera.position.clone().sub(controls.target);
     const sph=new THREE.Spherical().setFromVector3(off);
     const dth=Math.atan2(Math.sin(flyGoal.az-sph.theta),Math.cos(flyGoal.az-sph.theta));
     const targetPolar=flyGoal.pol ?? sph.phi;
     sph.theta+=dth*k;sph.phi+=(targetPolar-sph.phi)*k;sph.makeSafe();
     camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
     angDone=Math.abs(dth)<0.01&&Math.abs((flyGoal.pol ?? sph.phi)-sph.phi)<0.01;
   }
   if(Math.abs(nz-flyGoal.zoom)<1e-5&&controls.target.distanceTo(new THREE.Vector3(flyGoal.tx,flyGoal.ty,flyGoal.tz))<1e-5&&angDone){
    controls.target.set(flyGoal.tx,flyGoal.ty,flyGoal.tz);camera.zoom=flyGoal.zoom;camera.updateProjectionMatrix();flyGoal=null;
   }
 }
 controls.update();
 /* levels tween: modules glide to their planes; pipes re-route live */
 let lvlMoving=false;
 NODES.forEach(n=>{
  if(Math.abs(n._ly-n._lyT)>0.004){n._ly+=(n._lyT-n._ly)*0.12;lvlMoving=true;}
  else if(n._ly!==n._lyT){n._ly=n._lyT;lvlMoving=true;}
  meshById[n.id].position.y=n._ly;
 });
 if(lvlMoving)Object.values(edgeLinesById).forEach(o=>rebuildEdge(o));
 if(!lvlMoving&&rebuildDotsAfterLevelMotion){Object.values(edgeLinesById).forEach(o=>buildDots(o));rebuildDotsAfterLevelMotion=false;}
 /* while Stack lifts the levels, strokes bound to a module ride it each frame */
 if(lvlMoving||brushReliftPending){brush.relift();if(!lvlMoving)brushReliftPending=false;}
 /* advisory mist drifts only while Flow is on, and only on energized modules.
    Time is a free-running accumulator — never wrapped — so the fog field is a
    sampled continuum with no snap-back. */
 Object.keys(advisoryById).forEach(id=>{
  const on=cordon.size===0||cordon.has(id);
  advisoryById[id].forEach(p=>{
   const live=flowing&&on&&!RM;
   if(live)p.material.uniforms.uTime.value+=0.016;
  });
 });
 /* junction dots read exactly as their pipe: same ink, same opacity — ghosted pipe, ghosted join */
 Object.values(edgeLinesById).forEach(o=>{const lm=o.line.material;o.jn.forEach(j=>{j.material.color.copy(lm.color);j.material.opacity=lm.opacity;j.visible=lm.opacity>0.02;});});
 /* flow dots exist only where flow is on AND the line is lit */
 Object.values(edgeLinesById).forEach(o=>{
  if(!o.dots.length)return;
  const lit=flowing&&o.line.material.opacity>0.3; /* ghosted trace/circuit lines carry no dots */
  if(lit)o.t=(o.t+0.0018*o.speed)%1;
  const nd=o.dots.length;
  for(let k=0;k<nd;k++){
   const d=o.dots[k];
   d.visible=lit;
   if(!lit)continue;
   const dist=((o.t+k/nd)%1)*o.total;
   let i=1;while(i<o.L.length&&o.L[i]<dist)i++;
   const seg=(dist-o.L[i-1])/Math.max(1e-6,o.L[i]-o.L[i-1]);
   d.position.lerpVectors(o.pts[i-1],o.pts[i],seg);
  }
 });
 const rect=canvas.getBoundingClientRect();
 const far=camera.zoom<0.8,veryfar=camera.zoom<0.62;
 const ents: LabelEntry[]=[];
 NODES.forEach(n=>{
   tmpV.copy(n._anchor);tmpV.y+=n._ly;tmpV.project(camera);
   const lb=$<LabelElement>("lb-"+n.id);
   if(tmpV.z>1){if(lb.style.display!=="none")lb.style.display="none";return;}
   if(lb.style.display!=="")lb.style.display="";
   lb.classList.toggle("far",far);
   const vf=veryfar&&!(n.items&&n.items.length);
   lb.classList.toggle("veryfar",vf);
   const lx=(tmpV.x*0.5+0.5)*rect.width,ly=(-tmpV.y*0.5+0.5)*rect.height+4;
   const left=lx.toFixed(4)+"px",top=ly.toFixed(4)+"px";
   if(lb._left!==left){lb.style.left=left;lb._left=left;}
   if(lb._top!==top){lb.style.top=top;lb._top=top;}
   if(!vf)ents.push({n,lb,lx,ly,depth:tmpV.z});
 });
 /* declutter: place labels by priority; an overlapping lower-priority label recedes */
 if(++window.__lblTick%60===1||!window.__lblMeasured){
   ents.forEach(e=>{e.lb._w=e.lb.offsetWidth||80;e.lb._h=e.lb.offsetHeight||30;});
   window.__lblMeasured=true;
 }
 const prio=(e: LabelEntry): number=>(e.lb.classList.contains("hot")?8:0)+(cordon.has(e.n.id)?4:0)+((e.n.items&&e.n.items.length)?2:0);
 ents.sort((a,b)=>(prio(b)-prio(a))||(a.depth-b.depth));
 const placed: LabelRect[]=[];
 ents.forEach(e=>{
   const w=e.lb._w||80,h=e.lb._h||30;
   const r: LabelRect={x0:e.lx-w/2,x1:e.lx+w/2,y0:e.ly,y1:e.ly+h};
   const hit=placed.some(p=>r.x0<p.x1&&r.x1>p.x0&&r.y0<p.y1&&r.y1>p.y0);
   e.lb.classList.toggle("clash",hit);
   if(!hit)placed.push(r);
 });
 renderer.render(scene,camera);
 syncTick(); /* keep grouped surfaces frame-locked (the theater reads as one image) */
 nowPlayingTick(); /* keep the now-playing plate's progress + play state live */
}
document.fonts.ready.then(()=>{window.__lblMeasured=false;});
/* ————— R30 phase 1: restore the view after a live reload; remember theme + weights across sessions ————— */
window.__isoViewState=()=>({
 theme:document.documentElement.getAttribute("data-dp-theme"),dotSet,lineSet,stacked,pinned,
 cam:{p:[camera.position.x,camera.position.y,camera.position.z],t:[controls.target.x,controls.target.y,controls.target.z],zoom:camera.zoom},
 reds:NODES.filter(n=>n.items.some(i=>i.c==="red")).map(n=>n.id)});
(function restoreView(){
 let saved=null,theme=null;
 try{theme=localStorage.getItem("isoscope.dp.theme");const s=sessionStorage.getItem("isoscope.view");if(s){saved=JSON.parse(s);sessionStorage.removeItem("isoscope.view");}}catch(e){}
 const t=(saved&&saved.theme)||theme;
 if(t&&THEMES.some(x=>x.id===t)&&t!==document.documentElement.getAttribute("data-dp-theme"))setTheme(t);
 if(!saved)return;
 if(typeof saved.dotSet==="number"&&saved.dotSet!==dotSet)dashSeg.querySelectorAll("button")[saved.dotSet]?.click();
 if(typeof saved.lineSet==="number"&&saved.lineSet!==lineSet)weightSeg.querySelectorAll("button")[saved.lineSet]?.click();
 if(saved.stacked&&!stacked)btnStack.click();
 const redsNow=NODES.filter(n=>n.items.some(i=>i.c==="red")).map(n=>n.id);
 const newRed=redsNow.some(id=>!(saved.reds||[]).includes(id));
 if(newRed)return; /* the incident loop owns the camera: blast-radius flight stands */
 if(saved.cam){flyGoal=null;camera.position.set(saved.cam.p[0] ?? HOME.tx,saved.cam.p[1] ?? HOME.ty,saved.cam.p[2] ?? HOME.tz);controls.target.set(saved.cam.t[0] ?? HOME.tx,saved.cam.t[1] ?? HOME.ty,saved.cam.t[2] ?? HOME.tz);camera.zoom=saved.cam.zoom;camera.updateProjectionMatrix();controls.update();}
 if(saved.pinned&&byId[saved.pinned]&&cordon.size===0){pinned=saved.pinned;NODES.forEach(n=>mark(n.id,n.id===pinned));renderPanel(pinned);}
})();
window.__isoApplySpec=(spec: unknown)=>applySpec(spec as Spec);
window.__isoSwapState=()=>({stacked,pinned,selEdge,ti,flowing,dotSet,lineSet,cordon:[...cordon],
 cam:{p:camera.position.toArray(),t:controls.target.toArray(),zoom:camera.zoom},fly:!!flyGoal,
 center:{...CENTER},bounds:{..._bb},nodes:NODES.map(n=>({id:n.id,anchor:[n._anchor.x,n._ly,n._anchor.z],items:n.items})),
 edges:Object.fromEntries(Object.entries(edgeLinesById).map(([k,o])=>[k,{junctions:o.jn.filter(j=>j.parent===scene).length}])),
 memory:{...renderer.info.memory,programs:renderer.info.programs?.length ?? 0},children:scene.children.length});
window.dispatchEvent(new Event("isoscope-ready"));
tick();
