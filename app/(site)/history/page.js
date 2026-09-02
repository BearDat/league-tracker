'use client';

import React from 'react';
import Link from 'next/link';
import { useLeague, usePageTitle } from '../../../lib/LeagueContext';
import { seasonTeam, seasonAwards } from '../../../lib/domain/awards';
import { seasonPlayerTotals } from '../../../lib/domain/stats';
import { TeamMark, SectionHead, EmptyNote } from '../../../components/site/primitives';

export default function HistoryPage() {
  usePageTitle('History');
  const { snapshot } = useLeague();
  if (!snapshot) return <EmptyNote>No league data yet.</EmptyNote>;
  const seasons = snapshot.seasons || [];

  return (
    <div>
      <SectionHead title="History">
        <span className="eyebrow text-ink-mute pb-0.5">
          {seasons.length} {seasons.length === 1 ? 'season' : 'seasons'}
        </span>
      </SectionHead>

      {seasons.length === 0 ? (
        <EmptyNote>No seasons have been recorded yet.</EmptyNote>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
          {seasons.map(season => {
            const champion = seasonTeam(season, snapshot.teams, season.championTeamId);
            const awards = seasonAwards(snapshot, season);
            const stats = seasonPlayerTotals(season);
            const active = season.id === snapshot.activeSeasonId;
            return (
              <Link
                key={season.id}
                href={`/history/${season.id}`}
                className="card overflow-hidden animate-fade-up hover:bg-paper-well group"
              >
                <div className="h-1.5" style={{ background: champion ? (champion.color || '#0C2340') : 'var(--rule)' }} />
                <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
                  <h2 className="headline text-2xl group-hover:text-brick">{season.name}</h2>
                  <span className="eyebrow text-ink-mute">{active ? 'In progress' : 'Complete'}</span>
                </div>
                <div className="px-4 py-3">
                  {champion ? (
                    <div className="flex items-center gap-2.5">
                      <TeamMark team={champion} size={28} />
                      <div className="min-w-0">
                        <p className="eyebrow text-ink-mute leading-none">Champion</p>
                        <p className="font-display font-bold text-base truncate leading-tight mt-0.5">{champion.name}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-ink-mute">No champion crowned yet.</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-px bg-rule border-t border-rule text-center">
                  <div className="bg-paper px-2 py-2">
                    <div className="stat font-display font-bold text-lg leading-none">{season.members.length}</div>
                    <div className="eyebrow text-ink-mute mt-1">Clubs</div>
                  </div>
                  <div className="bg-paper px-2 py-2">
                    <div className="stat font-display font-bold text-lg leading-none">{awards.length}</div>
                    <div className="eyebrow text-ink-mute mt-1">Awards</div>
                  </div>
                  <div className="bg-paper px-2 py-2">
                    <div className="stat font-display font-bold text-lg leading-none">{stats.players.length}</div>
                    <div className="eyebrow text-ink-mute mt-1">Stat lines</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
