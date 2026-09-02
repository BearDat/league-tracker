import React from 'react';
import { getLeagueContext } from '../../../lib/league-server';
import { decorateGame } from '../../../lib/domain/standings';
import GameRow from '../../../components/site/GameRow';
import { SectionHead, EmptyNote, formatGameDate } from '../../../components/site/primitives';

export const revalidate = 60;
export const metadata = { title: 'Scores' };

function groupKey(game) {
  if (game.gameTimeUTC != null) return formatGameDate(game.gameTimeUTC);
  return game.date || 'Unscheduled';
}

export default async function ScoresPage() {
  const ctx = await getLeagueContext();
  if (!ctx || !ctx.season) return <EmptyNote>No season is published yet.</EmptyNote>;
  const { season, teamsById } = ctx;

  const played = (season.games || [])
    .filter(g => g.played && !g.isBye)
    .map(g => decorateGame(g, season, teamsById))
    .sort((a, b) => {
      if (a.gameTimeUTC != null && b.gameTimeUTC != null) return b.gameTimeUTC - a.gameTimeUTC;
      if (a.gameTimeUTC != null) return -1;
      if (b.gameTimeUTC != null) return 1;
      return 0;
    });

  const groups = [];
  played.forEach(game => {
    const key = groupKey(game);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.games.push(game);
    else groups.push({ key, games: [game] });
  });

  return (
    <div>
      <SectionHead title="Scores">
        <span className="eyebrow text-ink-mute pb-0.5">{played.length} played</span>
      </SectionHead>
      {groups.length === 0 ? (
        <EmptyNote>No games have been played yet.</EmptyNote>
      ) : (
        groups.map(group => (
          <section key={group.key} className="mb-7">
            <h3 className="eyebrow text-ink pb-1.5 mb-2 border-b border-rule-strong">{group.key}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-rule border border-rule">
              {group.games.map(g => (
                <div key={g.id} className="bg-paper">
                  <GameRow game={g} showDate={false} />
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
