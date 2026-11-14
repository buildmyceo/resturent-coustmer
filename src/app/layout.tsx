import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CustomerProvider } from '@/context/CustomerContext';
import { ToastContainer } from '@/components/ui/Toast';
import { CallWaiterModal } from '@/components/service/CallWaiterModal';

export const metadata: Metadata = {
  title: 'Ceova Restaurant | QR Menu & Online Dining Experience',
  description: 'Instant contactless restaurant digital menu, table ordering, live order tracking, and digital payments powered by Ceova Restaurant.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ceova',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-blue-500/20 selection:text-blue-700">
        <CustomerProvider>
          {children}
          <ToastContainer />
          <CallWaiterModal />
        </CustomerProvider>
      </body>
    </html>
  );
}

