'use client';

import React, { useState } from 'react';
import { useLeague, usePageTitle, findSeason } from '../../../lib/LeagueContext';
import { seasonTeam } from '../../../lib/domain/awards';
import SeasonTabs from '../../../components/site/SeasonTabs';
import { TeamMark, SectionHead, EmptyNote, cleanDiscordText } from '../../../components/site/primitives';

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
  if (!at) return 'Undated';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(at));
}

export default function TransactionsPage() {
  usePageTitle('Transactions');
  const { snapshot } = useLeague();
  const [seasonId, setSeasonId] = useState(null);
  if (!snapshot) return <EmptyNote>No league data yet.</EmptyNote>;

  const season = findSeason(snapshot, seasonId);
  if (!season) return <EmptyNote>No season is published yet.</EmptyNote>;

  const entries = [...(season.activityLog || [])].sort((a, b) => (b.at || 0) - (a.at || 0));

  return (
    <div>
      <SectionHead title="Transactions">
        <span className="eyebrow text-ink-mute pb-0.5">
          {entries.length} {entries.length === 1 ? 'move' : 'moves'}
        </span>
      </SectionHead>
      <SeasonTabs seasons={snapshot.seasons} activeId={season.id} onSelect={setSeasonId} />

      {entries.length === 0 ? (
        <EmptyNote>
          No roster moves recorded for {season.name}. Signings, releases, trades and suspensions land here
          as the Discord bot reads them.
        </EmptyNote>
      ) : (
        <div className="card row-rule">
          {entries.map(entry => {
            const team = seasonTeam(season, snapshot.teams, entry.teamId);
            const toTeam = seasonTeam(season, snapshot.teams, entry.toTeamId);
            return (
              <article key={entry.id} className="flex items-start gap-3 px-3 py-3">
                <TeamMark team={team} size={28} />
                {toTeam && toTeam.id !== (team && team.id) && <TeamMark team={toTeam} size={28} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`eyebrow ${TYPE_TONES[entry.type] || 'text-ink-mute'}`}>
                      {TYPE_LABELS[entry.type] || entry.type}
                    </span>
                    <span className="text-tiny text-ink-faint whitespace-nowrap">{when(entry.at)}</span>
                  </div>
                  <p className="text-sm text-ink mt-0.5">{cleanDiscordText(entry.text)}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
