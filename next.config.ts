import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
  cacheComponents: false,
  async headers() {
    return [
      { source: "/models/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/recommendation-runtime/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }] },
    ];
  },
  experimental: {
    serverActions: {
      // 帖子图片最多 4 张（浏览器端已压缩），请求体上限放宽到 12MB
      bodySizeLimit: "12mb",
    },
  },
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
