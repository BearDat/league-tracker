'use client';

import React from 'react';
import GameRow from './GameRow';
import { formatGameDate } from './primitives';

function groupKey(game, fallback) {
  if (game.gameTimeUTC != null) return formatGameDate(game.gameTimeUTC);
  return game.date || fallback;
}

export function groupGames(games, fallback) {
  const groups = [];
  games.forEach(game => {
    const key = groupKey(game, fallback);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.games.push(game);
    else groups.push({ key, games: [game] });
  });
  return groups;
}

export function sortByTime(games, direction) {
  return games.slice().sort((a, b) => {
    if (a.gameTimeUTC != null && b.gameTimeUTC != null) {
      return direction === 'desc' ? b.gameTimeUTC - a.gameTimeUTC : a.gameTimeUTC - b.gameTimeUTC;
    }
    if (a.gameTimeUTC != null) return -1;
    if (b.gameTimeUTC != null) return 1;
    return 0;
  });
}

export default function GameGroups({ groups }) {
  return groups.map(group => (
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
  ));
}
