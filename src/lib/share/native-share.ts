/**
 * Web Share (Level 2) helper shared by the donor detail CTA and the
 * ShareSection channel buttons.
 *
 * Enriches `navigator.share` so the OS share sheet can carry the lista's OG
 * image as an attached file — while degrading to the exact text+URL share when
 * anything is unavailable. Never a regression: any failure (no image meta,
 * fetch error, `canShare` false, Safari's `NotAllowedError`) falls back to a
 * plain text+URL `navigator.share`.
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

/**
 * Read the per-lista OG image URL from the current document.
 *
 * The image route is build-hashed, so its URL is only knowable at click time.
 * We only attach the PER-LISTA card — gated on the URL containing "/listas/".
 * On center-side pages that reuse ShareSection the page meta is the site-wide
 * brand image (or absent); attaching that would misrepresent the shared lista,
 * so those pages share text+URL only.
 */
function resolveListaOgImageUrl(): string | null {
  if (typeof document === "undefined") return null;
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[property="og:image"]',
  );
  const content = meta?.content?.trim();
  if (!content || !content.includes("/listas/")) return null;
  // The meta URL is absolute to metadataBase (venemedapp.org). The image route
  // exists on whatever deployment serves this page, so rewrite to the current
  // origin — otherwise the fetch is cross-origin (and fails) on localhost and
  // preview deploys.
  try {
    const parsed = new URL(content, window.location.origin);
    return `${window.location.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

/** Fetch the OG image as a shareable File, or null on any failure. */
async function loadOgImageFile(url: string): Promise<File | null> {
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
 * Invoke the native share sheet, attaching the per-lista OG image when the
 * platform supports file sharing.
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

  const imageUrl = resolveListaOgImageUrl();
  const file = imageUrl ? await loadOgImageFile(imageUrl) : null;

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
