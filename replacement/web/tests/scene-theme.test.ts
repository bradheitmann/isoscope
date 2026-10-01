import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import themeExports from "../../../vendor/desert-pants/build/web/themes.json";
import { applySceneTheme, parseDpColor, readDpColor } from "../src/TopologyCanvas";
import type { SceneThemeState } from "../src/TopologyCanvas";

const cssNames = {
  "color.bg.canvas": "--dp-color-bg-canvas",
  "color.bg.surface": "--dp-color-bg-surface",
  "color.bg.sunken": "--dp-color-bg-sunken",
  "color.text.primary": "--dp-color-text-primary",
  "color.text.faint": "--dp-color-text-faint",
  "color.border.subtle": "--dp-color-border-subtle",
  "color.accent.default": "--dp-color-accent-default",
  "color.accent.hover": "--dp-color-accent-hover",
  "color.signal.danger.fill": "--dp-color-signal-danger-fill",
  "color.signal.danger.soft": "--dp-color-signal-danger-soft",
} as const;

function installThemeColors(theme: typeof themeExports.themes[number], modeIndex: 0 | 1): void {
  for (const [role, variable] of Object.entries(cssNames) as Array<[keyof typeof cssNames, string]>) {
    const pair = theme.colors[role];
    const value = pair?.[modeIndex];
    if (value === undefined) throw new Error(`Missing canonical theme role ${role}.`);
    document.documentElement.style.setProperty(variable, value);
  }
}

function makeSceneThemeState(): SceneThemeState & { selected: THREE.MeshStandardMaterial; edge: THREE.LineBasicMaterial } {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color(), 0.01);
  const root = new THREE.Group();
  const selected = new THREE.MeshStandardMaterial({ color: new THREE.Color(), emissive: new THREE.Color() });
  selected.userData.dpColorToken = "--dp-color-signal-danger-fill";
  const node = new THREE.Mesh(new THREE.BoxGeometry(), selected);
  node.userData.signal = "danger";
  node.userData.nodeId = "selected-node";
  root.add(node);

  const edge = new THREE.LineBasicMaterial({ color: new THREE.Color(), transparent: true, opacity: 0.66 });
  edge.userData.dpColorToken = "--dp-color-signal-danger-fill";
  const line = new THREE.Line(new THREE.BufferGeometry(), edge);
  root.add(line);

  const ambient = new THREE.HemisphereLight(new THREE.Color(), new THREE.Color(), 2);
  const keyLight = new THREE.DirectionalLight(new THREE.Color(), 3.5);
  const fillLight = new THREE.PointLight(new THREE.Color(), 55, 32, 2);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(), transparent: true, opacity: 0.42 });
  floorMaterial.userData.dpColorToken = "--dp-color-bg-canvas";
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(), floorMaterial);
  const grid = new THREE.GridHelper(4, 2, new THREE.Color(), new THREE.Color());
  scene.add(root, ambient, keyLight, fillLight, floor, grid);
  return { scene, root, ambient, keyLight, fillLight, floor, grid, selected, edge };
}

describe("typed Desert Pants scene colors", () => {
  beforeEach(() => document.documentElement.removeAttribute("style"));

  it("parses canonical RGB syntax with exact alpha and color channels", () => {
    const resolved = parseDpColor("rgb(50 100 200 / 25%)");
    expect(resolved.alpha).toBe(0.25);
    expect(resolved.color.getHexString()).toBe(new THREE.Color("#3264c8").getHexString());
    expect(parseDpColor("#3264c8").alpha).toBe(1);
    expect(() => parseDpColor("var(--unresolved-token)")).toThrow(/did not resolve/);
  });

  it("requires the referenced canonical token instead of a renderer fallback", () => {
    document.documentElement.style.removeProperty("--dp-color-bg-canvas");
    expect(() => readDpColor("--dp-color-bg-canvas")).toThrow(/Missing Desert Pants color token/);
  });

  it("recolors lights, atmosphere, grid, floor, selected nodes, and edges in every exported theme mode", () => {
    const state = makeSceneThemeState();
    expect(themeExports.themes).toHaveLength(18);
    for (const theme of themeExports.themes) {
      for (const modeIndex of [0, 1] as const) {
        installThemeColors(theme, modeIndex);
        applySceneTheme(state, "selected-node");
        const expected = (role: keyof typeof cssNames): string => {
          const color = theme.colors[role][modeIndex];
          if (color === undefined) throw new Error(`Missing theme color for ${role}.`);
          return color.slice(1, 7).toLowerCase();
        };
        const expectedAlpha = (role: keyof typeof cssNames): number => {
          const color = theme.colors[role][modeIndex];
          if (color === undefined) throw new Error(`Missing theme color for ${role}.`);
          return parseDpColor(color).alpha;
        };
        expect(state.scene.fog).toBeInstanceOf(THREE.FogExp2);
        expect((state.scene.fog as THREE.FogExp2).color.getHexString()).toBe(expected("color.bg.canvas"));
        expect(state.floor.material.color.getHexString()).toBe(expected("color.bg.canvas"));
        expect(state.ambient.color.getHexString()).toBe(expected("color.text.primary"));
        expect(state.keyLight.color.getHexString()).toBe(expected("color.accent.default"));
        expect(state.fillLight.color.getHexString()).toBe(expected("color.accent.hover"));
        expect(state.selected.color.getHexString()).toBe(expected("color.signal.danger.fill"));
        expect(state.selected.emissive.getHexString()).toBe(expected("color.signal.danger.soft"));
        expect(state.edge.color.getHexString()).toBe(expected("color.signal.danger.fill"));
        expect(state.selected.opacity).toBeCloseTo(expectedAlpha("color.signal.danger.fill"));
        expect(state.edge.opacity).toBeCloseTo(0.66 * expectedAlpha("color.signal.danger.fill"));
        for (const material of Array.isArray(state.grid.material) ? state.grid.material : [state.grid.material]) {
          expect(material.color.getHexString()).toBe(expected("color.border.subtle"));
          expect(material.opacity).toBeCloseTo(0.24 * expectedAlpha("color.border.subtle"));
        }
      }
    }
  });
});
