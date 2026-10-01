import { describe, expect, it } from "vitest";
import { applyTheme, getTheme, themeInventory } from "../src/theme";
import colorExports from "../../../vendor/desert-pants/build/web/themes.json";

describe("generated Desert Pants themes", () => {
  it("exposes every canonical theme with its light and dark export", () => {
    expect(themeInventory).toHaveLength(18);
    expect(new Set(themeInventory.map((theme) => theme.id)).size).toBe(18);
    const modeExports = themeInventory.flatMap((theme) => [theme.light.name, theme.dark.name]);
    expect(modeExports).toHaveLength(36);
    expect(new Set(modeExports).size).toBe(36);
    for (const theme of themeInventory) {
      expect(theme.light.name.length).toBeGreaterThan(0);
      expect(theme.dark.name.length).toBeGreaterThan(0);
      expect(colorExports.themes.find((entry) => entry.id === theme.id)?.name).toBe(theme.name);
    }
  });

  it("keeps the token role inventory complete across all themes", () => {
    const baseRoles = Object.keys(colorExports.themes[0]?.colors ?? {}).sort();
    expect(baseRoles.length).toBeGreaterThan(1_600);
    expect(colorExports.themes).toHaveLength(18);
    for (const theme of colorExports.themes) {
      expect(Object.keys(theme.colors).sort()).toEqual(baseRoles);
      expect(theme.colors["color.bg.canvas"]).toHaveLength(2);
      expect(theme.colors["color.text.primary"]).toHaveLength(2);
      expect(theme.colors["color.accent.default"]).toHaveLength(2);
      for (const pair of Object.values(theme.colors)) {
        expect(pair).toHaveLength(2);
        expect(pair.every((value) => typeof value === "string" && value.length > 0)).toBe(true);
      }
    }
  });

  it("persists only an inventory-backed theme ID and a supported mode", () => {
    const theme = themeInventory[themeInventory.length - 1];
    expect(theme).toBeDefined();
    if (theme === undefined) return;
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    applyTheme(theme.id, "dark");
    expect(document.documentElement.dataset.dpTheme).toBe(theme.id);
    expect(document.documentElement.dataset.dpMode).toBe("dark");
    expect(window.localStorage.getItem("isoscope.theme")).toBe(theme.id);
    expect(window.localStorage.getItem("isoscope.mode")).toBe("dark");
    expect(getTheme("no-such-theme").id).toBe("desert");
    Reflect.deleteProperty(window, "localStorage");
  });
});
