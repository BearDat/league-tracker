import { Oswald, Inter } from 'next/font/google';
import './globals.css';

// Oswald for headlines/scores (the condensed, all-caps sports-broadcast
// look), Inter for body copy — same pairing broadcast-style league sites
// like CBL.ca use. Exposed as CSS variables so plain CSS/inline styles can
// reach them without every component importing the font module.
const oswald = Oswald({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-heading', display: 'swap' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });

export const metadata = {
  title: 'League Tracker',
  description: 'Standings, schedule, playoffs, stats, and odds.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
