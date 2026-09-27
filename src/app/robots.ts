import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants';

/**
 * Crawlers are welcome almost everywhere — the artefact routes (/api/og,
 * /api/story, posters) must stay crawlable or the video sitemap's
 * content_loc/thumbnail_loc point at doors Google refuses to open. Only the
 * admin surface and dev previews are off the map.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Facebook's preview crawlers, allowed by name (carried over from the
      // static robots.txt this file replaced).
      { userAgent: 'facebookexternalhit', allow: '/' },
      { userAgent: 'Facebot', allow: '/' },
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/admin/', '/preview/'],
      },
    ],
    sitemap: `https://${SITE_URL}/sitemap.xml`,
  };
}
