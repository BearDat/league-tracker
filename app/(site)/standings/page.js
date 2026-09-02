import React from 'react';
import { getLeagueContext } from '../../../lib/league-server';
import { computeStandings } from '../../../lib/domain/standings';
import { teamSlug } from '../../../lib/domain/core';
import StandingsTable from '../../../components/site/StandingsTable';
import { SectionHead, EmptyNote } from '../../../components/site/primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Standings' };

export default async function StandingsPage() {
  const ctx = await getLeagueContext();
  if (!ctx || !ctx.season) return <EmptyNote>No season is published yet.</EmptyNote>;
  const { season, teamsById } = ctx;
  const rows = computeStandings(season, teamsById).active.map(t => ({ ...t, slug: teamSlug(t.displayName) }));
  const playoffSpots = (season.settings && season.settings.playoffSpots) || null;

  return (
    <div>
      <SectionHead title="Standings">
        <span className="eyebrow text-ink-mute pb-0.5">{season.name}</span>
      </SectionHead>
      <div className="card">
        <StandingsTable rows={rows} playoffSpots={playoffSpots} />
      </div>
      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-tiny text-ink-mute">
        <div><dt className="inline eyebrow">PCT</dt> <dd className="inline">winning percentage</dd></div>
        <div><dt className="inline eyebrow">GB</dt> <dd className="inline">games behind the leader</dd></div>
        <div><dt className="inline eyebrow">DIFF</dt> <dd className="inline">run differential</dd></div>
        <div><dt className="inline eyebrow">STRK</dt> <dd className="inline">current streak</dd></div>
      </dl>
    </div>
  );
}
