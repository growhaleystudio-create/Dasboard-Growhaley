import './globals.css';
import type { Metadata } from 'next';
import { Lato } from 'next/font/google';
import { QueryProvider } from '@/components/QueryProvider';
import { Toaster } from '@/components/ui/Toaster';

const lato = Lato({ subsets: ['latin'], weight: ['300', '400', '700', '900'], variable: '--font-lato' });

export const metadata: Metadata = {
  title: 'Leads Generator Dashboard',
  description: 'AI-powered Leads Generation Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${lato.variable} font-inter antialiased bg-bg-white-0 text-text-strong-950`}>
        <QueryProvider>{children}</QueryProvider>
        <Toaster />
      </body>
    </html>
  );
}
