import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  // The GitHub webhook route needs the raw request body to verify the HMAC
  // signature, so we never let Next.js parse/transform it. Route handlers in the
  // App Router already give us the raw body via `req.text()`, so no extra config
  // is required here — this block documents the intent for future maintainers.
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
