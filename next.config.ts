import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas is a native Node.js addon (.node binary).
  // It cannot be bundled by Turbopack/webpack — mark it external so Next.js
  // requires it directly from node_modules at runtime instead of bundling it.
  serverExternalPackages: ['@napi-rs/canvas'],
};

export default nextConfig;
