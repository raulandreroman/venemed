import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
