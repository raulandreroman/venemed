/**
 * Web Share (Level 2) helper shared by the donor detail CTA and the
 * ShareSection channel buttons.
 *
 * Enriches `navigator.share` so the OS share sheet can carry the lista's STORY
 * image (portrait 1080×1920) as an attached file — while degrading to the exact
 * text+URL share when anything is unavailable. Never a regression: any failure
 * (non-lista URL, fetch error, `canShare` false, Safari's `NotAllowedError`)
 * falls back to a plain text+URL `navigator.share`.
 */

export type NativeShareData = {
  title: string;
  text: string;
  url: string;
};

export type NativeShareResult =
  | "shared" // native share completed (with or without a file)
  | "cancelled" // user dismissed the share sheet (AbortError)
  | "unsupported"; // no navigator.share — caller runs its own fallback

const SHARE_IMAGE_FILE_NAME = "venemed-lista.png";

// Matches a canonical donor lista path — "/listas/<id>" with no further
// segments. Both the donor detail and the center-side share blocks pass this
// same donor URL, so attaching the story card works from center pages too (the
// card describes the donor lista, which is exactly what those pages share).
const LISTA_PATH = /^\/listas\/[^/]+$/;

/**
 * Derive the per-lista STORY image URL from the canonical lista URL the caller
 * already shares (e.g. "https://venemedapp.org/listas/abc"). The story route is
 * deterministic — "<origin><pathname>/story-image" — so no meta-tag lookup is
 * needed. Returns null (→ text+URL share) for any non-lista URL, so center-side
 * pages that share a non-lista link never attach a mismatched image.
 *
 * The URL already carries the current origin (call sites build it with
 * `window.location.origin`), so the derived fetch is same-origin on localhost
 * and preview deploys as well as prod.
 */
function resolveStoryImageUrl(listaUrl: string): string | null {
  try {
    const parsed = new URL(listaUrl);
    if (!LISTA_PATH.test(parsed.pathname)) return null;
    return `${parsed.origin}${parsed.pathname}/story-image`;
  } catch {
    return null;
  }
}

/** Fetch the story image as a shareable File, or null on any failure. */
async function loadStoryImageFile(url: string): Promise<File | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], SHARE_IMAGE_FILE_NAME, { type: "image/png" });
  } catch {
    return null;
  }
}

/**
 * Invoke the native share sheet, attaching the per-lista STORY image when the
 * platform supports file sharing. `data.url` is the canonical lista URL; the
 * story image URL is derived from it.
 *
 * Gesture/activation note: fetching the blob first can consume the user
 * activation on strict browsers (Safari). We fetch the file, then call
 * `share`; if Safari rejects the file-carrying share with `NotAllowedError`,
 * we retry immediately with text+URL only. `AbortError` (user cancelled) is
 * reported as "cancelled" and never throws.
 */
export async function shareWithOptionalImage(
  data: NativeShareData,
): Promise<NativeShareResult> {
  if (typeof navigator === "undefined" || !navigator.share) {
    return "unsupported";
  }

  const imageUrl = resolveStoryImageUrl(data.url);
  const file = imageUrl ? await loadStoryImageFile(imageUrl) : null;

  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ ...data, files: [file] });
      return "shared";
    } catch (err) {
      if (isAbortError(err)) return "cancelled";
      // Safari can reject a file share with NotAllowedError even after
      // canShare returned true — retry immediately with text+URL only.
      // Any other error also falls through to the plain-share retry below.
    }
  }

  try {
    await navigator.share(data);
    return "shared";
  } catch (err) {
    if (isAbortError(err)) return "cancelled";
    // Treat an unsupported/failed plain share like no native share so the
    // caller runs its own fallback (copy / scroll).
    return "unsupported";
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
