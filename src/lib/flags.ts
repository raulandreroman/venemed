/**
 * Feature flags. `NEXT_PUBLIC_` so client + server read the same build-time
 * value. Default OFF — only the literal string "true" enables a flag.
 */

/**
 * "Tipo de centro" (center type) — registration field + donor "Sector" filter +
 * admin display. Off by default; flip `NEXT_PUBLIC_FEATURE_CENTER_TYPE=true` to
 * bring it back. While off, `center.type` is stored as NULL (no placeholder).
 */
export const CENTER_TYPE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_CENTER_TYPE === "true";
