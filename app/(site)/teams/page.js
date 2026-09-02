import React from 'react';
import Link from 'next/link';
import { getLeagueContext } from '../../../lib/league-server';
import { computeStandings } from '../../../lib/domain/standings';
import { teamSlug } from '../../../lib/domain/core';
import { TeamMark, SectionHead, EmptyNote, pct } from '../../../components/site/primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Teams' };

export default async function TeamsPage() {
  const ctx = await getLeagueContext();
  if (!ctx || !ctx.season) return <EmptyNote>No season is published yet.</EmptyNote>;
  const { season, teamsById } = ctx;
  const ranked = computeStandings(season, teamsById).active.map(t => ({ ...t, slug: teamSlug(t.displayName) }));
  const rows = ranked.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <div>
      <SectionHead title="Teams">
        <span className="eyebrow text-ink-mute pb-0.5">{rows.length} clubs</span>
      </SectionHead>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-rule border border-rule">
        {rows.map(t => (
          <Link
            key={t.id}
            href={`/teams/${t.slug}`}
            className="bg-paper hover:bg-paper-well flex items-center gap-3 p-3 group"
          >
            <span className="w-1 self-stretch flex-shrink-0" style={{ background: t.color || '#0C2340' }} />
            <TeamMark team={{ ...t, name: t.displayName }} size={40} />
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold text-base leading-tight truncate group-hover:text-brick">
                {t.displayName}
              </div>
              <div className="stat text-tiny text-ink-mute mt-0.5">
                {t.w}-{t.l} · {pct(t.pct)} · {t.rank} of {ranked.length}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
