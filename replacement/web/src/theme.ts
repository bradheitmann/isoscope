import { defaultTheme as generatedDefaultTheme, themes as generatedThemes } from "../../../vendor/desert-pants/build/web/themes";
import type { ThemeInfo } from "../../../vendor/desert-pants/build/web/themes";

export type ColorMode = "system" | "light" | "dark";

export type { ThemeInfo } from "../../../vendor/desert-pants/build/web/themes";
export const themeInventory = generatedThemes;
export const defaultThemeId = generatedDefaultTheme;
const themeById = new Map<string, ThemeInfo>(themeInventory.map((theme) => [theme.id, theme]));

function storedTheme(): string {
  try {
    const saved = window.localStorage.getItem("isoscope.theme");
    return saved !== null && themeById.has(saved) ? saved : defaultThemeId;
  } catch {
    return defaultThemeId;
  }
}

function storedMode(): ColorMode {
  try {
    const saved = window.localStorage.getItem("isoscope.mode");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  } catch {
    return "system";
  }
}

export function getTheme(themeId: string): ThemeInfo {
  const selected = themeById.get(themeId) ?? themeById.get(defaultThemeId) ?? themeInventory[0];
  if (selected === undefined) throw new Error("Vendored Desert Pants theme inventory is empty.");
  return selected;
}

export function applyTheme(themeId: string, mode: ColorMode): void {
  const root = document.documentElement;
  const validTheme = themeById.has(themeId) ? themeId : defaultThemeId;
  root.dataset.dpTheme = validTheme;
  root.dataset.dpMode = mode;
  const probe = document.createElement("span");
  probe.style.backgroundColor = "var(--dp-color-bg-canvas)";
  probe.style.display = "none";
  root.append(probe);
  const canvas = getComputedStyle(probe).backgroundColor.trim();
  probe.remove();
  if (canvas.length > 0) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", canvas);
  try {
    window.localStorage.setItem("isoscope.theme", validTheme);
    window.localStorage.setItem("isoscope.mode", mode);
  } catch {
    // Theme selection still applies for this page when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent("isoscope-theme-change", { detail: { themeId: validTheme, mode } }));
}

export function applyStoredTheme(): { themeId: string; mode: ColorMode } {
  const themeId = storedTheme();
  const mode = storedMode();
  applyTheme(themeId, mode);
  installSystemAppearanceListener();
  return { themeId, mode };
}

let systemListenerInstalled = false;

export function installSystemAppearanceListener(): void {
  if (systemListenerInstalled || typeof window.matchMedia !== "function") return;
  systemListenerInstalled = true;
  const appearance = window.matchMedia("(prefers-color-scheme: dark)");
  appearance.addEventListener("change", () => {
    const root = document.documentElement;
    if (root.dataset.dpMode === "system") {
      window.dispatchEvent(new CustomEvent("isoscope-theme-change", {
        detail: { themeId: root.dataset.dpTheme ?? defaultThemeId, mode: "system", systemScheme: appearance.matches ? "dark" : "light" },
      }));
    }
  });
}

export function modeLabel(mode: ColorMode): string {
  return mode === "system" ? "System" : mode === "light" ? "Light" : "Dark";
}
