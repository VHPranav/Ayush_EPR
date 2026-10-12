import path from "node:path";
import type { NextConfig } from "next";

// The Express API (server/server.js) keeps running unchanged; Next.js proxies /api/* to it
// so the browser only ever talks to one origin and no CORS setup is needed.
// NOTE: rewrites are resolved at build time, so API_URL must be set when running `next build`
// (the Docker image takes it as a build arg).
const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  output: "standalone", // minimal self-contained server for the Docker image
  // Pin the project root: the repo root also has a package-lock.json, which would otherwise be
  // picked as the workspace root and change the standalone output layout.
  outputFileTracingRoot: path.join(import.meta.dirname),
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Document uploads go through the proxy (MAX_UPLOAD_MB is 20 on the API).
    proxyClientMaxBodySize: "25mb",
  },
  turbopack: {
    root: path.join(import.meta.dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
