'use client';

import React from 'react';
import { seasonTeam } from '../../lib/domain/awards';
import { TeamMark, SectionHead, EmptyNote, cleanDiscordText } from './primitives';

const TYPE_LABELS = {
  trade: 'Trade',
  add: 'Signing',
  remove: 'Release',
  suspend: 'Suspension',
  unsuspend: 'Reinstated',
  ban: 'Ban',
  unban: 'Ban lifted',
};

const TYPE_TONES = {
  trade: 'text-brick',
  add: 'text-win',
  remove: 'text-ink-mute',
  suspend: 'text-brick',
  unsuspend: 'text-win',
  ban: 'text-loss',
  unban: 'text-win',
};

function when(at) {
  if (!at) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric',
  }).format(new Date(at));
}

export default function TransactionRail({ snapshot, season, limit = 6 }) {
  const entries = [...(season.activityLog || [])]
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .slice(0, limit);

  return (
    <div className="mt-8">
      <SectionHead title="Transactions" href="/transactions" linkLabel="All moves" />
      <div className="card row-rule">
        {entries.length === 0 ? (
          <EmptyNote>No roster moves yet this season.</EmptyNote>
        ) : (
          entries.map(entry => {
            const team = seasonTeam(season, snapshot.teams, entry.teamId);
            return (
              <article key={entry.id} className="flex items-start gap-2.5 px-3 py-2.5">
                <TeamMark team={team} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`eyebrow ${TYPE_TONES[entry.type] || 'text-ink-mute'}`}>
                      {TYPE_LABELS[entry.type] || entry.type}
                    </span>
                    <span className="text-tiny text-ink-faint whitespace-nowrap">{when(entry.at)}</span>
                  </div>
                  <p className="text-sm text-ink-soft mt-0.5 line-clamp-3">{cleanDiscordText(entry.text)}</p>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
