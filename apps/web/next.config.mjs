/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? (process.env.NEXT_DIST_DIR ?? ".next-dev") : ".next",
  output: "export",
  transpilePackages: ["@bml/contracts"],
};

export default nextConfig;
