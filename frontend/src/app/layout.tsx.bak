import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';

// Inter, per the Resident Portal Design System — a single premium
// grotesque carries both the large greeting/number moments and the
// operational UI (forms, tables, buttons), so nothing needs to switch
// families across the app.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
});
const fraunces = inter;
const plexSans = inter;

export const metadata: Metadata = {
  title: 'Entryva',
  description: 'Entryva. Create, share, and verify visitor access for your estate.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/favicon-32.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plexSans.variable}`}>
      <body className="ambient-glow min-h-screen font-body text-ink antialiased">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
