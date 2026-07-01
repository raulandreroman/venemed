// Client (browser) Sentry init. Next.js 15.3+/Turbopack loads this file for the
// client runtime. Shares the hardened, PII-scrubbing options; no Session Replay,
// no performance tracing, no default PII. No-op without NEXT_PUBLIC_SENTRY_DSN.
import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@/lib/sentry/options";

Sentry.init(baseSentryOptions);

// Required for Sentry to instrument client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
