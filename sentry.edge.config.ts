// Edge runtime Sentry init (middleware / edge routes). Loaded from
// src/instrumentation.ts. Shares the hardened options in src/lib/sentry/options.ts.
import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@/lib/sentry/options";

Sentry.init(baseSentryOptions);
