import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import type { JSX, PointerEvent } from "react";
import type { MapModel, NodeSignal } from "./types";

interface Props {
  model: MapModel;
  selectedId: string | null;
  circuit: boolean;
  stacked: boolean;
  traceEdge: string | null;
  onSelect: (id: string) => void;
  onHome: () => void;
}

export interface SceneThemeState {
  scene: THREE.Scene;
  root: THREE.Group;
  ambient: THREE.HemisphereLight;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.PointLight;
  floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  grid: THREE.GridHelper;
}

interface SceneState extends SceneThemeState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  root: THREE.Group;
  ambient: THREE.HemisphereLight;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.PointLight;
  floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  grid: THREE.GridHelper;
  nodes: Map<string, THREE.Group>;
  edges: Map<string, THREE.Object3D>;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  resize: () => void;
  render: () => void;
  fit: () => void;
  disposeObjects: () => void;
  disposeResize: () => void;
}

interface NodePosition {
  x: number;
  z: number;
  elevation: number;
}

const paletteVariables: Record<NodeSignal, string> = {
  danger: "--dp-color-signal-danger-fill",
  warning: "--dp-color-signal-warning-fill",
  info: "--dp-color-signal-info-fill",
  success: "--dp-color-signal-success-fill",
  accent: "--dp-color-accent-default",
  muted: "--dp-color-text-faint",
};

const softVariables: Record<NodeSignal, string> = {
  danger: "--dp-color-signal-danger-soft",
  warning: "--dp-color-signal-warning-soft",
  info: "--dp-color-signal-info-soft",
  success: "--dp-color-signal-success-soft",
  accent: "--dp-color-accent-default",
  muted: "--dp-color-border-subtle",
};

function cssColor(variable: string): THREE.Color {
  return readDpColor(variable).color;
}

export interface ResolvedDpColor {
  color: THREE.Color;
  alpha: number;
}

/** Resolve the generated DP custom property first, then parse channels without losing alpha. */
export function parseDpColor(value: string): ResolvedDpColor {
  const normalized = value.trim();
  const match = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (match !== null) {
    const [, red, green, blue, alpha = "1"] = match;
    const alphaValue = alpha.endsWith("%") ? Number(alpha.slice(0, -1)) / 100 : Number(alpha);
    return {
      color: new THREE.Color().setRGB(Number(red) / 255, Number(green) / 255, Number(blue) / 255, THREE.SRGBColorSpace),
      alpha: Number.isFinite(alphaValue) ? Math.min(1, Math.max(0, alphaValue)) : 1,
    };
  }
  const hex = normalized.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (hex !== null) {
    const digits = hex[1] ?? "";
    const expanded = digits.length <= 4 ? [...digits].map((channel) => `${channel}${channel}`).join("") : digits;
    const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
    return { color: new THREE.Color(`#${expanded.slice(0, 6)}`), alpha };
  }
  throw new Error(`Desert Pants color token did not resolve to RGB channels: ${normalized || "(empty)"}`);
}

export function readDpColor(variable: string): ResolvedDpColor {
  const root = document.documentElement;
  const tokenValue = getComputedStyle(root).getPropertyValue(variable).trim();
  if (tokenValue.length === 0) throw new Error(`Missing Desert Pants color token ${variable}.`);
  const probe = document.createElement("span");
  probe.style.color = `var(${variable})`;
  probe.style.display = "none";
  root.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  try {
    return parseDpColor(resolved);
  } catch {
    // Custom-property values remain hex in non-browser CSSOMs; parsing them is still exact.
    return parseDpColor(tokenValue);
  }
}

function signalColor(signal: NodeSignal): THREE.Color {
  return cssColor(paletteVariables[signal]);
}

function softColor(signal: NodeSignal): THREE.Color {
  return cssColor(softVariables[signal]);
}

function applyColor(material: THREE.Material | THREE.Light, variable: string): void {
  const resolved = readDpColor(variable);
  const candidate = material as THREE.Material & { color?: THREE.Color; opacity?: number; transparent?: boolean };
  if (candidate.color !== undefined) candidate.color.copy(resolved.color);
  if (candidate.opacity !== undefined) {
    const previousTokenAlpha = Number(material.userData.dpTokenAlpha ?? 1);
    const visualOpacity = Number(material.userData.dpVisualOpacity ?? candidate.opacity / previousTokenAlpha);
    material.userData.dpTokenAlpha = resolved.alpha;
    material.userData.dpVisualOpacity = visualOpacity;
    candidate.opacity = visualOpacity * resolved.alpha;
    candidate.transparent = resolved.alpha < 1 || visualOpacity < 1;
  }
}

function setVisualOpacity(material: THREE.Material, opacity: number): void {
  const candidate = material as THREE.Material & { opacity?: number; transparent?: boolean };
  const tokenAlpha = Number(material.userData.dpTokenAlpha ?? 1);
  material.userData.dpVisualOpacity = opacity;
  if (candidate.opacity !== undefined) {
    candidate.opacity = opacity * tokenAlpha;
    candidate.transparent = candidate.opacity < 1;
  }
}

export function applySceneTheme(state: SceneThemeState, selectedId: string | null): void {
  const fog = state.scene.fog;
  if (fog instanceof THREE.FogExp2) fog.color.copy(cssColor("--dp-color-bg-canvas"));
  applyColor(state.ambient, "--dp-color-text-primary");
  applyColor(state.keyLight, "--dp-color-accent-default");
  applyColor(state.fillLight, "--dp-color-accent-hover");
  applyColor(state.floor.material, "--dp-color-bg-canvas");
  state.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const token = material.userData.dpColorToken;
      if (typeof token === "string") applyColor(material, token);
      const signal = object.userData.signal as NodeSignal | undefined;
      if (signal !== undefined && material instanceof THREE.MeshStandardMaterial) {
        const selected = object.userData.nodeId === selectedId;
        material.emissive.copy(selected ? softColor(signal) : cssColor("--dp-color-bg-sunken"));
      }
    }
  });
  const gridMaterials = Array.isArray(state.grid.material) ? state.grid.material : [state.grid.material];
  for (const material of gridMaterials) {
    applyColor(material, "--dp-color-border-subtle");
    setVisualOpacity(material, 0.24);
  }
}

function stablePositions(model: MapModel, stacked: boolean): Map<string, NodePosition> {
  const result = new Map<string, NodePosition>();
  const groupOrder = new Map(model.groups.map((group, index) => [group.id, index]));
  const byGroup = new Map<string, typeof model.nodes>();
  for (const node of model.nodes) {
    const list = byGroup.get(node.groupId) ?? [];
    list.push(node);
    byGroup.set(node.groupId, list);
  }
  const groupIds = [...byGroup.keys()].sort((a, b) => (groupOrder.get(a) ?? 0) - (groupOrder.get(b) ?? 0));
  const groupCenters = new Map(groupIds.map((id, index) => {
    const angle = groupIds.length > 1 ? (index / groupIds.length) * Math.PI * 2 : -Math.PI / 2;
    return [id, { x: Math.cos(angle) * 5.4, z: Math.sin(angle) * 4.3 }];
  }));
  for (const [groupIndex, groupId] of groupIds.entries()) {
    const members = byGroup.get(groupId) ?? [];
    const center = groupCenters.get(groupId) ?? { x: 0, z: 0 };
    for (const [memberIndex, node] of members.entries()) {
      const angle = (memberIndex / Math.max(1, members.length)) * Math.PI * 2 - Math.PI / 2;
      const radius = members.length <= 1 ? 0 : Math.max(1.5, Math.sqrt(members.length) * 1.1);
      const x = node.position?.x ?? center.x + Math.cos(angle) * radius;
      const z = node.position?.z ?? center.z + Math.sin(angle) * radius;
      const stackedElevation = stacked ? groupIndex * 0.95 : 0;
      result.set(node.id, {
        x,
        z,
        elevation: (node.position?.elevation ?? 0) + stackedElevation,
      });
    }
  }
  return result;
}

function disposeChild(child: THREE.Object3D): void {
  child.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    }
  });
}

function createNode(
  node: MapModel["nodes"][number],
  position: NodePosition,
  index: number,
  lowDetail: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(position.x, position.elevation, position.z);
  group.userData.nodeId = node.id;
  const main = signalColor(node.signal);
  const soft = softColor(node.signal);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: soft, roughness: 0.48, metalness: 0.12 });
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: main, roughness: 0.28, metalness: 0.22 });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: cssColor("--dp-color-bg-surface"),
    roughness: 0.36,
    metalness: 0.28,
  });
  baseMaterial.userData.dpColorToken = softVariables[node.signal];
  bodyMaterial.userData.dpColorToken = paletteVariables[node.signal];
  darkMaterial.userData.dpColorToken = "--dp-color-bg-surface";
  applyColor(baseMaterial, softVariables[node.signal]);
  applyColor(bodyMaterial, paletteVariables[node.signal]);
  applyColor(darkMaterial, "--dp-color-bg-surface");
  const height = node.position === undefined ? 0.95 + (index % 4) * 0.18 : 0.75 + (node.position.elevation > 0 ? 0.2 : 0);
  const base = new THREE.Mesh(new RoundedBoxGeometry(1.58, 0.2, 1.36, 2, 0.1), baseMaterial);
  base.position.y = 0.1;
  base.userData.signal = node.signal;
  base.userData.nodeId = node.id;
  base.castShadow = false;
  base.receiveShadow = false;
  group.add(base);
  const bodyGeometry = lowDetail
    ? new THREE.BoxGeometry(0.98, height, 0.94)
    : new RoundedBoxGeometry(0.98, height, 0.94, 3, 0.14);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = height / 2 + 0.19;
  body.userData.signal = node.signal;
  body.userData.nodeId = node.id;
  body.castShadow = false;
  group.add(body);
  if (!lowDetail) {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.52, node.criticalPath ? 6 : 8), darkMaterial);
    crown.position.y = height + 0.48;
    crown.rotation.y = index * 0.37;
    crown.userData.signal = node.signal;
    crown.userData.nodeId = node.id;
    group.add(crown);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.67, 0.025, 6, 36),
      new THREE.MeshBasicMaterial({ color: main, transparent: true, opacity: 0.72 }),
    );
    ring.material.userData.dpColorToken = paletteVariables[node.signal];
    applyColor(ring.material, paletteVariables[node.signal]);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = height + 0.1;
    ring.userData.signal = node.signal;
    ring.userData.nodeId = node.id;
    group.add(ring);
  }
  group.userData.signal = node.signal;
  group.userData.materials = [bodyMaterial, baseMaterial, darkMaterial];
  return group;
}

function makeLine(
  points: THREE.Vector3[],
  color: THREE.Color,
  width: number,
  opacity: number,
): THREE.Object3D {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, linewidth: width });
  return new THREE.Line(geometry, material);
}

function createScene(host: HTMLDivElement, nodeCount: number, reducedMotion: boolean): SceneState {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: nodeCount < 100,
    powerPreference: "low-power",
    stencil: false,
    depth: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, nodeCount > 140 ? 0.85 : 1.35);
  renderer.setPixelRatio(pixelRatio);
  renderer.domElement.className = "topology-canvas__surface";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(cssColor("--dp-color-bg-canvas"), 0.013);
  const camera = new THREE.OrthographicCamera(-11, 11, 11, -11, 0.1, 140);
  camera.position.set(14, 19, 18);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.075;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.minZoom = 0.4;
  controls.maxZoom = 2.2;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(0, 0.4, 0);

  const ambient = new THREE.HemisphereLight(cssColor("--dp-color-text-primary"), cssColor("--dp-color-bg-surface"), 2.0);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(cssColor("--dp-color-accent-default"), 3.5);
  keyLight.position.set(-8, 15, 7);
  scene.add(keyLight);
  const fillLight = new THREE.PointLight(cssColor("--dp-color-accent-default"), 55, 32, 2);
  fillLight.position.set(9, 7, -6);
  scene.add(fillLight);

  const root = new THREE.Group();
  scene.add(root);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: cssColor("--dp-color-bg-canvas"),
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.42,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), floorMaterial);
  floorMaterial.userData.dpColorToken = "--dp-color-bg-canvas";
  applyColor(floorMaterial, "--dp-color-bg-canvas");
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.14;
  root.add(floor);
  const gridColor = cssColor("--dp-color-border-subtle");
  const grid = new THREE.GridHelper(100, 50, gridColor, gridColor);
  grid.userData.dpColorToken = "--dp-color-border-subtle";
  grid.position.y = -0.12;
  if (Array.isArray(grid.material)) {
    for (const material of grid.material) {
      material.transparent = true;
      material.opacity = 0.24;
    }
  } else {
    grid.material.transparent = true;
    grid.material.opacity = 0.24;
  }
  for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) {
    material.userData.dpColorToken = "--dp-color-border-subtle";
    applyColor(material, "--dp-color-border-subtle");
  }
  root.add(grid);

  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 0.18 };
  const pointer = new THREE.Vector2();
  const nodes = new Map<string, THREE.Group>();
  const edges = new Map<string, THREE.Object3D>();
  let width = 0;
  let height = 0;
  const resize = (): void => {
    width = host.clientWidth;
    height = host.clientHeight;
    if (width <= 0 || height <= 0) return;
    const halfHeight = 11;
    const halfWidth = halfHeight * width / height;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  };
  const render = (): void => renderer.render(scene, camera);
  const fit = (): void => {
    if (nodes.size === 0) return;
    const bounds = new THREE.Box3();
    for (const group of nodes.values()) bounds.expandByObject(group);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    controls.target.set(center.x, Math.max(0.35, center.y), center.z);
    camera.position.set(center.x + size.x * 0.72 + 8, center.y + size.y * 1.4 + 8, center.z + size.z * 0.8 + 8);
    camera.zoom = Math.min(1.3, Math.max(0.56, 18 / Math.max(size.x, size.z, 12)));
    camera.updateProjectionMatrix();
    controls.update();
    render();
  };
  const disposeObjects = (): void => {
    for (const node of nodes.values()) {
      root.remove(node);
      disposeChild(node);
    }
    for (const edge of edges.values()) {
      root.remove(edge);
      disposeChild(edge);
    }
    nodes.clear();
    edges.clear();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  controls.addEventListener("change", render);
  resize();
  const state: SceneState = {
    renderer,
    scene,
    camera,
    controls,
    root,
    ambient,
    keyLight,
    fillLight,
    floor,
    grid,
    nodes,
    edges,
    raycaster,
    pointer,
    resize,
    render,
    fit,
    disposeObjects,
    disposeResize: () => observer.disconnect(),
  };
  renderer.domElement.addEventListener("webglcontextlost", (event) => event.preventDefault());
  host.dataset.quality = nodeCount > 140 ? "adaptive" : "balanced";
  return state;
}

function nearestNodeId(object: THREE.Object3D | undefined): string | null {
  let current = object;
  while (current !== undefined) {
    const id = current.userData.nodeId;
    if (typeof id === "string") return id;
    current = current.parent ?? undefined;
  }
  return null;
}

function rotateCamera(scene: SceneState | null, direction: -1 | 1): void {
  if (scene === null) return;
  const offset = scene.camera.position.clone().sub(scene.controls.target);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * Math.PI / 9);
  scene.camera.position.copy(scene.controls.target).add(offset);
  scene.camera.lookAt(scene.controls.target);
  scene.controls.update();
}

function relatedNodes(model: MapModel, selectedId: string | null): Set<string> {
  if (selectedId === null) return new Set(model.nodes.map((node) => node.id));
  const related = new Set([selectedId]);
  for (const edge of model.edges) {
    if (edge.from === selectedId) related.add(edge.to);
    if (edge.to === selectedId) related.add(edge.from);
  }
  return related;
}

export function TopologyCanvas({ model, selectedId, circuit, stacked, traceEdge, onSelect, onHome }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const selectedRef = useRef(onSelect);
  selectedRef.current = onSelect;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [sceneError, setSceneError] = useState<string | null>(null);
  const reducedMotion = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    try {
      const scene = createScene(host, model.nodes.length, reducedMotion.current);
      sceneRef.current = scene;
      let frame = 0;
      let last = 0;
      const animate = (time: number): void => {
        if (reducedMotion.current || time - last > 40) {
          scene.controls.update();
          scene.render();
          last = time;
        }
        frame = window.requestAnimationFrame(animate);
      };
      const schedule = (): void => {
        if (!reducedMotion.current && frame === 0) frame = window.requestAnimationFrame(animate);
      };
      schedule();
      const onTheme = (): void => {
        applySceneTheme(scene, selectedIdRef.current);
        scene.render();
      };
      const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onMotionPreference = (event: MediaQueryListEvent): void => {
        reducedMotion.current = event.matches;
        scene.controls.enableDamping = !event.matches;
        if (event.matches && frame !== 0) {
          window.cancelAnimationFrame(frame);
          frame = 0;
          scene.controls.update();
          scene.render();
        } else {
          schedule();
        }
      };
      window.addEventListener("isoscope-theme-change", onTheme);
      motionPreference.addEventListener("change", onMotionPreference);
      applySceneTheme(scene, selectedIdRef.current);
      setSceneError(null);
      return () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener("isoscope-theme-change", onTheme);
        motionPreference.removeEventListener("change", onMotionPreference);
        const current = sceneRef.current;
        if (current !== null) {
          current.disposeObjects();
          current.disposeResize();
          current.controls.dispose();
          current.renderer.dispose();
          current.renderer.domElement.remove();
          sceneRef.current = null;
        }
      };
    } catch (error) {
      setSceneError(error instanceof Error ? error.message : "WebGL is unavailable in this browser.");
      return undefined;
    }
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (scene === null) return;
    scene.disposeObjects();
    const positions = stablePositions(model, stacked);
    const lowDetail = model.nodes.length > 95;
    for (const [index, node] of model.nodes.entries()) {
      const position = positions.get(node.id);
      if (position === undefined) continue;
      const object = createNode(node, position, index, lowDetail);
      scene.nodes.set(node.id, object);
      scene.root.add(object);
    }
    for (const edge of model.edges) {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (from === undefined || to === undefined) continue;
      const middle = new THREE.Vector3((from.x + to.x) / 2, Math.max(from.elevation, to.elevation) + 0.44, (from.z + to.z) / 2);
      const points = [
        new THREE.Vector3(from.x, from.elevation + 0.18, from.z),
        new THREE.Vector3(from.x, from.elevation + 0.36, from.z),
        middle,
        new THREE.Vector3(to.x, to.elevation + 0.36, to.z),
        new THREE.Vector3(to.x, to.elevation + 0.18, to.z),
      ];
      const criticalIds = new Set(model.nodes.filter((node) => node.criticalPath).map((node) => node.id));
      const bothCritical = criticalIds.has(edge.from) && criticalIds.has(edge.to);
      const signal = bothCritical ? "warning" : edge.signal;
      const color = signalColor(signal);
      let object: THREE.Object3D;
      if (model.edges.length > 340 || edge.broken) {
        object = makeLine(points, color, 1, edge.broken ? 0.3 : 0.66);
      } else {
        const curve = new THREE.CatmullRomCurve3(points);
        const geometry = new THREE.TubeGeometry(curve, 20, 0.026, 6, false);
        const material = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.82, roughness: 0.42, metalness: 0.1 });
        object = new THREE.Mesh(geometry, material);
      }
      object.userData.edgeId = edge.id;
      object.userData.signal = signal;
      object.userData.dpColorToken = paletteVariables[signal];
      if ("material" in object) {
        const material = object.material;
        for (const entry of Array.isArray(material) ? material : [material]) {
          entry.userData.dpColorToken = paletteVariables[signal];
          applyColor(entry, paletteVariables[signal]);
        }
      }
      scene.edges.set(edge.id, object);
      scene.root.add(object);
      if (!lowDetail && edge.kind === "data") {
        const bead = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 10, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82 }),
        );
        bead.position.copy(middle);
        bead.userData.edgeId = edge.id;
        bead.userData.signal = signal;
        scene.root.add(bead);
      }
    }
    if (scene.nodes.size > 0 && scene.controls.target.length() === 0) scene.fit();
    scene.render();
  }, [model, stacked]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (scene === null) return;
    const related = relatedNodes(model, circuit ? selectedId : null);
    for (const node of model.nodes) {
      const object = scene.nodes.get(node.id);
      if (object === undefined) continue;
      const selected = node.id === selectedId;
      const visible = related.has(node.id);
      object.scale.setScalar(selected ? 1.06 : 1);
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            material.transparent = !visible;
            if (material.opacity !== undefined) setVisualOpacity(material, visible ? 1 : 0.12);
            if (material instanceof THREE.MeshStandardMaterial) material.emissive.copy(selected ? softColor(node.signal) : cssColor("--dp-color-bg-sunken"));
          }
        }
      });
    }
    for (const edge of model.edges) {
      const object = scene.edges.get(edge.id);
      if (object === undefined) continue;
      const inCircuit = related.has(edge.from) && related.has(edge.to);
      const traced = traceEdge === edge.id;
      const material = "material" in object ? object.material : undefined;
      if (material !== undefined) {
        for (const entry of Array.isArray(material) ? material : [material]) {
          const candidate = entry as THREE.Material & { opacity?: number };
          if (candidate.opacity !== undefined) setVisualOpacity(entry, circuit && !inCircuit ? 0.12 : traced ? 1 : 0.76);
        }
      }
      object.scale.setScalar(traced ? 1.5 : 1);
    }
    scene.render();
  }, [model, selectedId, circuit, traceEdge]);

  const downPoint = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    downPoint.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const start = downPoint.current;
    downPoint.current = null;
    const scene = sceneRef.current;
    const canvas = scene?.renderer.domElement;
    if (start === null || scene === null || canvas === undefined) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const bounds = canvas.getBoundingClientRect();
    scene.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    scene.raycaster.setFromCamera(scene.pointer, scene.camera);
    const hits = scene.raycaster.intersectObjects([...scene.nodes.values()], true);
    const id = nearestNodeId(hits[0]?.object);
    if (id !== null) selectedRef.current(id);
  };

  useEffect(() => {
    if (sceneError !== null) return;
    const scene = sceneRef.current;
    if (scene !== null) scene.render();
  }, [sceneError]);

  return (
    <div className="topology-canvas" ref={hostRef} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className="topology-canvas__atmosphere" aria-hidden="true" />
      <div className="topology-canvas__labels" aria-hidden="true">
        <span>ORTHOGRAPHIC · LIVE TOPOLOGY</span>
        <span>{model.nodes.length} nodes <i /> {model.edges.length} links</span>
      </div>
      <div className="topology-canvas__controls" role="group" aria-label="Map camera controls">
        <button type="button" className="icon-button" onClick={() => rotateCamera(sceneRef.current, -1)} aria-label="Rotate map left">↶</button>
        <button type="button" className="icon-button" onClick={() => rotateCamera(sceneRef.current, 1)} aria-label="Rotate map right">↷</button>
        <button type="button" className="icon-button topology-canvas__home" onClick={() => { sceneRef.current?.fit(); onHome(); }} aria-label="Fit all modules in view">Fit</button>
      </div>
      <div className="topology-canvas__legend" aria-label="Node status legend">
        <span><i className="signal-dot signal-dot--danger" />Blocker</span>
        <span><i className="signal-dot signal-dot--warning" />Review</span>
        <span><i className="signal-dot signal-dot--info" />In progress</span>
        <span><i className="signal-dot signal-dot--muted" />Unobserved</span>
      </div>
      {sceneError !== null && (
        <div className="topology-canvas__fallback" role="status">
          <strong>3D view unavailable</strong>
          <span>{sceneError} The complete keyboard-accessible graph and item table remain below.</span>
        </div>
      )}
    </div>
  );
}
