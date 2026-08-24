import './globals.css';

export const metadata = {
  title: 'League Tracker',
  description: 'Standings, schedule, playoffs, stats, and odds.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
