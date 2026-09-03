'use client';

import React from 'react';
import Link from 'next/link';
import { useSeason } from '../../lib/LeagueContext';
import { computeStandings, recentResults, upcomingGames } from '../../lib/domain/standings';
import { teamSlug } from '../../lib/domain/core';
import { buildBracket } from '../../lib/domain/playoffs';
import Bracket from '../../components/site/Bracket';
import StandingsTable from '../../components/site/StandingsTable';
import GameRow from '../../components/site/GameRow';
import NewsHero from '../../components/site/NewsHero';
import TransactionRail from '../../components/site/TransactionRail';
import { SectionHead, EmptyNote, TeamMark } from '../../components/site/primitives';

export default function HomePage() {
  const ctx = useSeason();
  if (!ctx) return <EmptyNote>No season is published yet.</EmptyNote>;
  const { season, teamsById, snapshot } = ctx;
  const standings = computeStandings(season, teamsById).active.map(t => ({ ...t, slug: teamSlug(t.displayName) }));
  const recent = recentResults(season, teamsById, 6);
  const upcoming = upcomingGames(season, teamsById, 6);
  const playoffSpots = (season.settings && season.settings.playoffSpots) || null;
  const bracket = buildBracket(season, teamsById);
  const news = [...(snapshot.news || [])].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 4);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_19rem] gap-8">
      <div className="min-w-0">
        <NewsHero posts={news} />

        {bracket.active && (
          <section className="mb-8">
            <SectionHead title={bracket.champion ? 'Champion' : 'Postseason'} href="/playoffs" linkLabel="Full bracket" />
            {bracket.champion ? (
              <div className="card overflow-hidden animate-fade-up">
                <div className="brand-rule" />
                <div className="flex items-center gap-4 p-4 bg-brand-soft">
                  <TeamMark team={bracket.champion} size={48} />
                  <div className="min-w-0">
                    <p className="eyebrow text-ink-mute">{season.name} champion</p>
                    <p className="headline text-2xl truncate">{bracket.champion.name}</p>
                  </div>
                </div>
              </div>
            ) : (
              <Bracket bracket={bracket} compact />
            )}
          </section>
        )}

        <section className="mb-8">
          <SectionHead title="Latest results" href="/scores" linkLabel="All scores" />
          {recent.length === 0 ? (
            <EmptyNote>No games have been played yet.</EmptyNote>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-rule border border-rule stagger">
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

        <TransactionRail snapshot={snapshot} season={season} />

        {snapshot.info && snapshot.info.description && (
          <div className="mt-8">
            <SectionHead title="About" />
            <div className="card px-3 py-3">
              <p className="text-sm text-ink-soft whitespace-pre-line">{snapshot.info.description}</p>
            </div>
          </div>
        )}
        {snapshot.info && snapshot.info.discordUrl && (
          <Link
            href={snapshot.info.discordUrl}
            className="inline-block mt-4 eyebrow bg-navy text-white px-3 py-2"
          >
            Join the Discord
          </Link>
        )}
      </aside>
    </div>
  );
}
