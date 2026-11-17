import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // allow VS Code dev tunnels (port forwarding) to load dev assets / HMR
  allowedDevOrigins: ["**.devtunnels.ms"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
