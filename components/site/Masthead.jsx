'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Home', exact: true },
  { href: '/scores', label: 'Scores' },
  { href: '/standings', label: 'Standings' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/teams', label: 'Teams' },
];

export default function Masthead({ leagueName, seasonName }) {
  const pathname = usePathname();
  const isActive = (item) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  return (
    <header className="bg-navy text-white">
      <div className="mx-auto max-w-shell px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-baseline gap-3">
            <span className="font-display font-extrabold text-3xl tracking-tighter leading-none">KPB</span>
            <span className="hidden sm:block eyebrow text-white/55 leading-none">{leagueName}</span>
          </Link>
          <div className="flex items-center gap-4">
            {seasonName && (
              <span className="hidden md:block eyebrow text-white/55">{seasonName}</span>
            )}
            <Link
              href="/classic"
              className="eyebrow text-white/70 hover:text-white border border-white/25 px-2.5 py-1.5 leading-none"
            >
              Admin
            </Link>
          </div>
        </div>
      </div>

      <nav className="border-t border-navy-line">
        <div className="mx-auto max-w-shell px-4">
          <ul className="flex items-stretch gap-1 overflow-x-auto">
            {NAV.map(item => {
              const active = isActive(item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block px-3 py-3 eyebrow whitespace-nowrap border-b-2 transition-colors ${
                      active
                        ? 'text-white border-brick'
                        : 'text-white/60 border-transparent hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </header>
  );
}
