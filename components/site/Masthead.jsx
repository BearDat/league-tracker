'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { useLeague } from '../../lib/LeagueContext';
import { isPostseason } from '../../lib/domain/playoffs';

const BASE_NAV = [
  { href: '/', label: 'Home', exact: true },
  { href: '/scores', label: 'Scores' },
  { href: '/standings', label: 'Standings' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/teams', label: 'Teams' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/news', label: 'News' },
  { href: '/stats', label: 'Stats' },
  { href: '/awards', label: 'Awards' },
  { href: '/hall-of-fame', label: 'Hall of Fame' },
  { href: '/history', label: 'History' },
];

export default function Masthead() {
  const pathname = usePathname();
  const { snapshot } = useLeague();
  const leagueName = (snapshot && snapshot.name) || 'League';
  const season = snapshot && (snapshot.seasons || []).find(s => s.id === snapshot.activeSeasonId);
  const postseason = !!(season && isPostseason(season));

  const nav = postseason
    ? [...BASE_NAV.slice(0, 2), { href: '/playoffs', label: 'Playoffs' }, ...BASE_NAV.slice(2)]
    : BASE_NAV;
  const isActive = (item) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  return (
    <header className="bg-navy text-white">
      <div className="mx-auto max-w-shell px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-baseline gap-3 group">
            <span className="font-display font-extrabold text-3xl tracking-tighter leading-none transition-opacity group-hover:opacity-80">
              KPB
            </span>
            <span className="hidden sm:block eyebrow text-white/55 leading-none">{leagueName}</span>
          </Link>
          <div className="flex items-center gap-3">
            {postseason && (
              <span className="hidden sm:flex items-center gap-1.5 eyebrow text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F49AC8] animate-pulse-dot" />
                Postseason
              </span>
            )}
            {season && <span className="hidden md:block eyebrow text-white/55">{season.name}</span>}
            <ThemeToggle />
            <Link
              href="/admin"
              className="eyebrow text-white/70 hover:text-white border border-white/25 px-2.5 py-1.5 leading-none transition-colors"
            >
              Admin
            </Link>
          </div>
        </div>
      </div>

      <nav className="border-t border-navy-line">
        <div className="mx-auto max-w-shell px-4">
          <ul className="flex items-stretch gap-1 overflow-x-auto">
            {nav.map(item => {
              const active = isActive(item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`relative block px-3 py-3 eyebrow whitespace-nowrap transition-colors ${
                      active ? 'text-white' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {item.label}
                    <span
                      className={`absolute left-0 right-0 bottom-0 h-[2px] origin-left transition-transform duration-200 ease-out ${
                        active ? 'scale-x-100 bg-brand' : 'scale-x-0 bg-white/40'
                      }`}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      <div className="brand-rule" />
    </header>
  );
}
