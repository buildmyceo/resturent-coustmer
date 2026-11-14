import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CustomerProvider } from '@/context/CustomerContext';
import { ToastContainer } from '@/components/ui/Toast';
import { CallWaiterModal } from '@/components/service/CallWaiterModal';

export const metadata: Metadata = {
  title: 'Ceova Restaurant | Digital Dining & Contactless Ordering',
  description: 'Instant contactless restaurant digital menu, table ordering, live order tracking, and digital payments.',
  icons: {
    icon: '/ceova-logo.png',
    apple: '/ceova-logo.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
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

