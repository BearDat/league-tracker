'use client';

import React from 'react';
import { TeamMark, PlayerLink, TeamLink, EmptyNote } from './primitives';

function Winner({ winner }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 border-b border-rule last:border-b-0">
      <TeamMark team={winner.team} size={22} />
      <span className="flex-1 min-w-0 truncate text-sm font-medium">
        {winner.kind === 'team'
          ? <TeamLink team={winner.team}>{winner.name}</TeamLink>
          : <PlayerLink name={winner.name} slug={winner.slug} />}
      </span>
      {winner.kind === 'player' && winner.team && (
        <span className="eyebrow text-ink-faint truncate max-w-[9rem]">{winner.team.name}</span>
      )}
    </div>
  );
}

export default function AwardList({ awards, emptyNote }) {
  if (!awards || awards.length === 0) {
    return <EmptyNote>{emptyNote}</EmptyNote>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {awards.map(award => (
        <section key={award.id} className="card overflow-hidden">
          <div className="brand-rule" />
          <div className="px-3 py-2 border-b border-rule-strong">
            <h3 className="headline text-lg leading-tight">{award.name}</h3>
            {award.description && <p className="text-tiny text-ink-mute mt-0.5">{award.description}</p>}
            {award.winners.length > 1 && (
              <p className="eyebrow text-ink-faint mt-0.5">{award.winners.length} winners</p>
            )}
          </div>
          {award.winners.map((w, i) => <Winner key={`${w.name}-${i}`} winner={w} />)}
        </section>
      ))}
    </div>
  );
}
