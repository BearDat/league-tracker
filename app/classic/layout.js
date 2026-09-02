import { Oswald, Inter } from 'next/font/google';

const oswald = Oswald({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-heading', display: 'swap' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });

export const metadata = { title: 'Admin' };

export default function ClassicLayout({ children }) {
  return <div className={`${oswald.variable} ${inter.variable} classic-shell`}>{children}</div>;
}
