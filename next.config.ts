import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas is a native Node.js addon (.node binary).
  // It cannot be bundled by Turbopack — require it directly at runtime instead.
  serverExternalPackages: ['@napi-rs/canvas'],

  async headers() {
    return [
      {
        // Star share pages — must be publicly cacheable so Facebook/Twitter
        // scrapers can read og: meta tags and cache the preview.
        // Next.js 16 marks these as private/no-store by default because
        // `params` is a runtime API. Override that here.
        source: '/s/:shortcode',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=300, stale-while-revalidate=3600',
          },
        ],
      },
      {
        // OG image endpoint — longer cache, it only changes if content changes.
        source: '/api/og/:shortcode',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
