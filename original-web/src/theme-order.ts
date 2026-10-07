import { themes, type ThemeId } from "../vendor/desert-pants/build/web/themes";

/* Themes, ordered for this map. Worst-case WCAG contrast (text + accent over the
   canvas, the weaker of light/dark) was measured across all 18; the ones that stay
   readable AND keep their accent/signal colors legible in both modes lead. Within
   that, the livelier palettes come first. The rest follow, then the source order. */
const LEAD: ThemeId[] = [
  "dracula",      /* vibrant, fun, 13.4/5.9 — strong both modes */
  "catppuccin",   /* modern pastel, accent 8.1 in dark */
  "rose-pine",    /* elegant, accent 8.4 in dark */
  "gruvbox",      /* warm retro, balanced 10.2/5.5 */
  "kanagawa",     /* balanced, accent 5.9 dark */
  "nord",         /* cool + clean, 9.7/4.6 */
  "everforest",   /* calm green, 8.1/4.6 */
  "high-contrast",/* max readability, 14.5/8.2 */
  "github",       /* crisp neutral, 15.8 text */
];
const LEAD_SET = new Set<ThemeId>(LEAD);
const lead = LEAD.map((id) => themes.find((t) => t.id === id)).filter((t): t is (typeof themes)[number] => !!t);
const rest = themes.filter((t) => !LEAD_SET.has(t.id));
export const presentedThemes = [...lead, ...rest];
