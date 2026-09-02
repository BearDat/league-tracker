import React from 'react';
import Link from 'next/link';
import Masthead from '../../components/site/Masthead';
import { getLeagueContext } from '../../lib/league-server';
import { isPostseason } from '../../lib/domain/playoffs';

export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children }) {
  const ctx = await getLeagueContext();
  const leagueName = (ctx && ctx.league && ctx.league.name) || 'League';
  const seasonName = (ctx && ctx.season && ctx.season.name) || null;
  const postseason = !!(ctx && ctx.season && isPostseason(ctx.season));
  const updatedAt = ctx && ctx.updatedAt ? new Date(ctx.updatedAt) : null;

  return (
    <div className="min-h-screen flex flex-col bg-paper-well">
      <Masthead leagueName={leagueName} seasonName={seasonName} postseason={postseason} />
      <main className="flex-1 mx-auto max-w-shell w-full px-4 py-6">{children}</main>
      <footer className="border-t border-rule bg-paper mt-8">
        <div className="mx-auto max-w-shell px-4 py-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-tiny text-ink-mute">
            {leagueName}{seasonName ? ` · ${seasonName}` : ''}
            {updatedAt && (
              <span className="ml-2 text-ink-faint">
                data as of{' '}
                {new Intl.DateTimeFormat('en-US', {
                  timeZone: 'America/New_York', month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                }).format(updatedAt)} ET
              </span>
            )}
          </p>
          <Link href="/classic" className="eyebrow text-ink-mute hover:text-brick">
            Admin
          </Link>
        </div>
      </footer>
    </div>
  );
}
