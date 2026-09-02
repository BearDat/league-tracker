'use client';

import React from 'react';
import { useSeason, usePageTitle } from '../../../lib/LeagueContext';
import { buildBracket } from '../../../lib/domain/playoffs';
import Bracket from '../../../components/site/Bracket';
import GameRow from '../../../components/site/GameRow';
import { TeamMark, SectionHead, EmptyNote } from '../../../components/site/primitives';

export default function PlayoffsPage() {
  usePageTitle('Playoffs');
  const ctx = useSeason();
  if (!ctx) return <EmptyNote>No season is published yet.</EmptyNote>;
  const { season, teamsById } = ctx;
  const bracket = buildBracket(season, teamsById);

  if (!bracket.active) {
    return (
      <div>
        <SectionHead title="Playoffs" />
        <EmptyNote>The postseason has not started yet.</EmptyNote>
      </div>
    );
  }

  const liveGames = bracket.rounds
    .flatMap(r => r.series)
    .flatMap(s => s.games)
    .filter(g => !g.played);

  return (
    <div>
      {bracket.champion && (
        <div className="card mb-6 overflow-hidden animate-fade-up">
          <div className="brand-rule" />
          <div className="flex items-center gap-4 p-5 bg-brand-soft">
            <TeamMark team={bracket.champion} size={56} />
            <div className="min-w-0">
              <p className="eyebrow text-ink-mute">{season.name} champion</p>
              <h1 className="headline text-3xl sm:text-4xl truncate">{bracket.champion.name}</h1>
            </div>
          </div>
        </div>
      )}

      <SectionHead title="Bracket">
        <span className="eyebrow text-ink-mute pb-0.5">{season.name}</span>
      </SectionHead>
      <Bracket bracket={bracket} />

      {liveGames.length > 0 && (
        <section className="mt-8">
          <SectionHead title="Still to play" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-rule border border-rule stagger">
            {liveGames.map(g => (
              <div key={g.id} className="bg-paper">
                <GameRow game={g} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
