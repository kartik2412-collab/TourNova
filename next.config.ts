import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Confine Turbopack module resolution to this project so stray lockfiles in
  // an enclosing directory (e.g. the user's home folder) are never picked up.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
