import React from 'react';
import Link from 'next/link';
import { getLeagueContext } from '../../lib/league-server';
import { computeStandings, recentResults, upcomingGames } from '../../lib/domain/standings';
import { teamSlug } from '../../lib/domain/core';
import StandingsTable from '../../components/site/StandingsTable';
import GameRow from '../../components/site/GameRow';
import { SectionHead, EmptyNote } from '../../components/site/primitives';

export const revalidate = 60;

export default async function HomePage() {
  const ctx = await getLeagueContext();
  if (!ctx || !ctx.season) {
    return <EmptyNote>No season is published yet.</EmptyNote>;
  }
  const { season, teamsById, league } = ctx;
  const standings = computeStandings(season, teamsById).active.map(t => ({ ...t, slug: teamSlug(t.displayName) }));
  const recent = recentResults(season, teamsById, 6);
  const upcoming = upcomingGames(season, teamsById, 6);
  const playoffSpots = (season.settings && season.settings.playoffSpots) || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_19rem] gap-8">
      <div className="min-w-0">
        <section className="mb-8">
          <SectionHead title="Latest results" href="/scores" linkLabel="All scores" />
          {recent.length === 0 ? (
            <EmptyNote>No games have been played yet.</EmptyNote>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-rule border border-rule">
              {recent.map(g => (
                <div key={g.id} className="bg-paper">
                  <GameRow game={g} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHead title="Standings" href="/standings" linkLabel="Full standings" />
          <div className="card">
            <StandingsTable rows={standings.slice(0, 10)} playoffSpots={playoffSpots} compact />
          </div>
          {playoffSpots && standings.length > playoffSpots && (
            <p className="text-tiny text-ink-mute mt-2">
              The rule marks the cut for the top {playoffSpots} playoff {playoffSpots === 1 ? 'seed' : 'seeds'}.
            </p>
          )}
        </section>
      </div>

      <aside className="min-w-0">
        <SectionHead title="Coming up" href="/schedule" linkLabel="Schedule" />
        <div className="card row-rule">
          {upcoming.length === 0 ? (
            <EmptyNote>Nothing scheduled.</EmptyNote>
          ) : (
            upcoming.map(g => <GameRow key={g.id} game={g} />)
          )}
        </div>

        {league && league.info && league.info.description && (
          <div className="mt-8">
            <SectionHead title="About" />
            <div className="card px-3 py-3">
              <p className="text-sm text-ink-soft whitespace-pre-line">{league.info.description}</p>
              {league.info.discordUrl && (
                <Link
                  href={league.info.discordUrl}
                  className="inline-block mt-3 eyebrow bg-navy text-white px-3 py-2"
                >
                  Join the Discord
                </Link>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
