import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Next.js's built-in build-time lint step expects .eslintrc-style config and
    // breaks against our flat config (eslint.config.mjs) — lint via `bun run lint`
    // at the repo root instead, which already covers this workspace.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
