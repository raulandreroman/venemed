import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
  // Donor share links to the old /solicitudes routes circulate indefinitely
  // (lista-model-v2 §5, decision D6) — keep this redirect permanently.
  // The lista INDEX now lives on "/" (hero + filters + feed on one page), so
  // /listas and /solicitudes both land there; /listas/<id> stays a real route.
  async redirects() {
    return [
      { source: "/listas", destination: "/", permanent: true },
      { source: "/solicitudes", destination: "/", permanent: true },
      { source: "/solicitudes/:path*", destination: "/listas/:path*", permanent: true },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Quiet unless in CI.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  // Only upload source maps when an auth token is available (CI/prod build);
  // local builds without the token stay clean.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
