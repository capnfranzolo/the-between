import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import './globals.css';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'The Between',
  description: "Answer one question. Your answer becomes a star. Find the strangers closer to you than you think.",
  openGraph: {
    title: 'The Between',
    description: "Answer one question. Your answer becomes a star. Find the strangers closer to you than you think.",
    siteName: 'The Between',
    type: 'website',
    url: 'https://thebetween.world',
    images: [{
      url: 'https://thebetween.world/api/og/default',
      width: 1200,
      height: 630,
      alt: 'The Between',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Between',
    description: "Answer one question. Your answer becomes a star.",
    images: ['https://thebetween.world/api/og/default'],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'The Between',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1E1840',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`} style={{ height: '100%' }}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
        {/* fb:app_id must use property= attribute — Next.js other: generates name= */}
        {process.env.NEXT_PUBLIC_FB_APP_ID && (
          <meta property="fb:app_id" content={process.env.NEXT_PUBLIC_FB_APP_ID} />
        )}
      </head>
      <body style={{ height: '100%', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
