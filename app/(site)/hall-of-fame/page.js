'use client';

import React from 'react';
import { useLeague, usePageTitle } from '../../../lib/LeagueContext';
import { hallOfFameEntries } from '../../../lib/domain/awards';
import { SectionHead, EmptyNote, PlayerLink, cleanDiscordText } from '../../../components/site/primitives';

export default function HallOfFamePage() {
  usePageTitle('Hall of Fame');
  const { snapshot } = useLeague();
  if (!snapshot) return <EmptyNote>No league data yet.</EmptyNote>;
  const entries = hallOfFameEntries(snapshot);

  return (
    <div>
      <SectionHead title="Hall of Fame">
        <span className="eyebrow text-ink-mute pb-0.5">
          {entries.length} {entries.length === 1 ? 'inductee' : 'inductees'}
        </span>
      </SectionHead>

      {entries.length === 0 ? (
        <EmptyNote>Nobody has been inducted yet.</EmptyNote>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
          {entries.map(entry => (
            <article key={entry.id} className="card overflow-hidden animate-fade-up">
              <div className="brand-rule" />
              <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
                <h2 className="headline text-2xl truncate">
                  {entry.slug ? <PlayerLink name={entry.name} slug={entry.slug} /> : entry.name}
                </h2>
                {entry.year && <span className="eyebrow text-ink-mute whitespace-nowrap">Class {entry.year}</span>}
              </div>
              {entry.note && (
                <p className="text-sm text-ink-soft whitespace-pre-line px-4 py-3">{cleanDiscordText(entry.note)}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
