'use client';

import React from 'react';
import { useSeason, usePageTitle } from '../../../lib/LeagueContext';
import { decorateGame } from '../../../lib/domain/standings';
import GameGroups, { groupGames, sortByTime } from '../../../components/site/GameGroups';
import { SectionHead, EmptyNote } from '../../../components/site/primitives';

export default function SchedulePage() {
  usePageTitle('Schedule');
  const ctx = useSeason();
  if (!ctx) return <EmptyNote>No season is published yet.</EmptyNote>;
  const { season, teamsById } = ctx;

  const pending = sortByTime(
    (season.games || []).filter(g => !g.played && !g.isBye).map(g => decorateGame(g, season, teamsById)),
    'asc',
  );
  const groups = groupGames(pending, 'Date TBD');

  return (
    <div>
      <SectionHead title="Schedule">
        <span className="eyebrow text-ink-mute pb-0.5">{pending.length} remaining</span>
      </SectionHead>
      {groups.length === 0
        ? <EmptyNote>Every scheduled game has been played.</EmptyNote>
        : <GameGroups groups={groups} />}
    </div>
  );
}
