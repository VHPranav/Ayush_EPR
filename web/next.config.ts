import path from "node:path";
import type { NextConfig } from "next";

// Two build flavours:
//  - default: the real app. The Express API (server/server.js) keeps running unchanged and Next.js proxies
//    /api/* to it, so the browser only talks to one origin (no CORS). Rewrites are resolved at build time,
//    so API_URL must be set when running `next build` (the Docker image takes it as a build arg).
//  - NEXT_PUBLIC_DEMO=1 (`npm run build:demo`): a fully static, view-only preview with built-in sample data
//    and no backend. The finished site is written to web/out-demo (a separate folder, so building it never
//    overwrites the .next folder a running dev server uses) and can be dropped on any static host.
const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";

const shared: NextConfig = {
  // Pin the project root: the repo root also has a package-lock.json, which would otherwise be
  // picked as the workspace root and change the build output layout.
  outputFileTracingRoot: path.join(import.meta.dirname),
  turbopack: {
    root: path.join(import.meta.dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const nextConfig: NextConfig = DEMO
  ? // Static export can't use Cache Components / Partial Prefetching (they need a server), so they're real-build only.
    { ...shared, output: "export", images: { unoptimized: true }, distDir: "out-demo" }
  : {
      ...shared,
      cacheComponents: true,
      partialPrefetching: true,
      output: "standalone", // minimal self-contained server for the Docker image
      experimental: {
        // Document uploads go through the proxy (MAX_UPLOAD_MB is 20 on the API).
        proxyClientMaxBodySize: "25mb",
      },
      async rewrites() {
        return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
      },
    };

export default nextConfig;
