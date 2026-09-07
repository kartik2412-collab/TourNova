import type { NextConfig } from "next";

// Serve under a subpath (e.g. "/TourNova" on GitHub Pages project sites).
// Set PAGES_BASE_PATH during static builds/deploys; omit it for local dev
// and standalone hosts so routes stay at the domain root.
const pagesBasePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath ? `${pagesBasePath}/` : "",
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
