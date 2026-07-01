// Server (Node.js runtime) Sentry init. Loaded from src/instrumentation.ts.
// Options — including the PII scrubbing and errors-only config — are shared in
// src/lib/sentry/options.ts. No-op when NEXT_PUBLIC_SENTRY_DSN is unset.
import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@/lib/sentry/options";

Sentry.init(baseSentryOptions);
