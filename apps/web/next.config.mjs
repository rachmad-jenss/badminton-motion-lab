/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 blocks cross-origin dev-resource requests unless allowed; the
  // local Playwright suite talks to the dev:test server via 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  distDir: process.env.NODE_ENV === "development" ? (process.env.NEXT_DIST_DIR ?? ".next-dev") : ".next",
  // Static export only for production builds (Cloudflare Pages needs apps/web/out).
  // Dev mode keeps the server runtime: unconditional "export" breaks Next dev Fast Refresh.
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  transpilePackages: ["@bml/contracts"],
};

export default nextConfig;
