// CI runs `tsc --noEmit` without the generated (gitignored) next-env.d.ts, so
// static image imports (e.g. "@/assets/venemed-logo-mark.png") need Next's
// image module declarations referenced from a committed file.
/// <reference types="next/image-types/global" />
