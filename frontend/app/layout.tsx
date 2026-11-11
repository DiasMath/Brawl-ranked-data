import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Brawl Ranked Lab',
  description: 'Painel privado para análise do Ranqueado de Brawl Stars.',
  robots: { index: false, follow: false },
  icons: { icon: '/ranked.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
