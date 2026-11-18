import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // allow VS Code dev tunnels (port forwarding) to load dev assets / HMR
  allowedDevOrigins: ["**.devtunnels.ms"],
  // ซ่อนป้าย dev ของ Next ("Cache disabled") ที่มุมซ้ายล่าง — ทับปุ่ม + − ของผัง
  // error ตอน compile / runtime ยังแสดงตามปกติ
  devIndicators: false,
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
