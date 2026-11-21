import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Caemora Inventory', template: '%s · Caemora Inventory' },
  description: 'Purchases, shipments, landed cost and reconciliation',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#4f46e5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
