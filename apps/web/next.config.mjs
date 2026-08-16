/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? (process.env.NEXT_DIST_DIR ?? ".next-dev") : ".next",
  // Static export only for production builds (Cloudflare Pages needs apps/web/out).
  // Dev mode keeps the server runtime: unconditional "export" breaks Next dev Fast Refresh.
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  transpilePackages: ["@bml/contracts"],
};

export default nextConfig;
