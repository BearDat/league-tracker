'use client';

import React, { useState } from 'react';
import { useLeague, usePageTitle, findSeason } from '../../../lib/LeagueContext';
import { seasonAwards } from '../../../lib/domain/awards';
import AwardList from '../../../components/site/AwardList';
import SeasonTabs from '../../../components/site/SeasonTabs';
import { SectionHead, EmptyNote } from '../../../components/site/primitives';

export default function AwardsPage() {
  usePageTitle('Awards');
  const { snapshot } = useLeague();
  const [seasonId, setSeasonId] = useState(null);
  if (!snapshot) return <EmptyNote>No league data yet.</EmptyNote>;

  const season = findSeason(snapshot, seasonId);
  if (!season) return <EmptyNote>No season is published yet.</EmptyNote>;
  const awards = seasonAwards(snapshot, season);
  const winnerCount = awards.reduce((n, a) => n + a.winners.length, 0);

  return (
    <div>
      <SectionHead title="Awards">
        <span className="eyebrow text-ink-mute pb-0.5">
          {winnerCount > 0 ? `${winnerCount} winner${winnerCount === 1 ? '' : 's'}` : season.name}
        </span>
      </SectionHead>
      <SeasonTabs seasons={snapshot.seasons} activeId={season.id} onSelect={setSeasonId} />
      <AwardList awards={awards} emptyNote={`No awards have been handed out for ${season.name} yet.`} />
    </div>
  );
}
