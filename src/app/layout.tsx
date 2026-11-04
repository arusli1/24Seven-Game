import type { Metadata, Viewport } from 'next';
import { DM_Serif_Display, Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const ui = Inter({ subsets: ['latin'], variable: '--font-ui' });
const serif = DM_Serif_Display({ subsets: ['latin'], weight: '400', variable: '--font-serif' });

const description = 'The hardest 24 game. Make 24 from four numbers with + − × ÷.';

export const metadata: Metadata = {
  metadataBase: new URL('https://hard24.vercel.app'),
  title: 'twentyfour',
  description,
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
  openGraph: { title: 'twentyfour', description, type: 'website' },
};

export const viewport: Viewport = { themeColor: '#0b0b0c' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
