import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas is a native Node.js addon (.node binary).
  // It cannot be bundled by Turbopack — require it directly at runtime instead.
  serverExternalPackages: ['@napi-rs/canvas'],
};

export default nextConfig;
