import { Easing } from "remotion";

// VeneMed design tokens (from src/app/globals.css) — for scene chrome only;
// product UI comes from the vendored components + Tailwind tokens.
export const colors = {
  background: "#f7f8fa",
  surface: "#ffffff",
  accent: "#1f5aa8",
  accentSubtle: "#eef4fb",
  accentBorder: "#aec9ea",
  accentOn: "#ffffff",
  neutral900: "#111827",
  neutral700: "#374151",
  neutral600: "#4b5563",
  neutral500: "#6b7280",
  neutral200: "#dde1e8",
  neutral100: "#eef0f4",
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 9999,
} as const;

/**
 * Motion tokens — a small system, not one curve:
 *  - ENTER decelerates (ease-out): elements arrive and settle.
 *  - EXIT accelerates (ease-in): scenes leave with intent.
 *  - Opacity resolves slightly faster than transforms (FADE), so nothing
 *    "ghosts" while still moving.
 * Durations in frames @30fps.
 */
export const EASE_ENTER = Easing.bezier(0.16, 1, 0.3, 1); // strong ease-out
export const EASE_EXIT = Easing.bezier(0.55, 0, 1, 0.45); // ease-in
export const EASE_FADE = Easing.bezier(0.33, 1, 0.68, 1); // gentler ease-out for opacity

export const DUR = {
  enter: 26, // ~0.85s transform settle
  fade: 18, // ~0.6s opacity resolve
  exit: 12, // ~0.4s scene out
  stagger: 8, // between siblings
} as const;
