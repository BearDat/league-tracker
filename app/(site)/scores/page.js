'use client';

import React from 'react';
import { useSeason, usePageTitle } from '../../../lib/LeagueContext';
import { decorateGame } from '../../../lib/domain/standings';
import GameGroups, { groupGames, sortByTime } from '../../../components/site/GameGroups';
import { SectionHead, EmptyNote } from '../../../components/site/primitives';

export default function ScoresPage() {
  usePageTitle('Scores');
  const ctx = useSeason();
  if (!ctx) return <EmptyNote>No season is published yet.</EmptyNote>;
  const { season, teamsById } = ctx;

  const played = sortByTime(
    (season.games || []).filter(g => g.played && !g.isBye).map(g => decorateGame(g, season, teamsById)),
    'desc',
  );
  const groups = groupGames(played, 'Unscheduled');

  return (
    <div>
      <SectionHead title="Scores">
        <span className="eyebrow text-ink-mute pb-0.5">{played.length} played</span>
      </SectionHead>
      {groups.length === 0
        ? <EmptyNote>No games have been played yet.</EmptyNote>
        : <GameGroups groups={groups} />}
    </div>
  );
}
