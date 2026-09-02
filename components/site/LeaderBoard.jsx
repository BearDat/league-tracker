'use client';

import React from 'react';
import { leaderboard } from '../../lib/domain/stats';
import { TeamMark, PlayerLink } from './primitives';

export default function LeaderBoard({ title, players, boards, teamFor }) {
  return (
    <div>
      <h3 className="eyebrow text-ink pb-1.5 mb-2 border-b border-rule-strong">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-rule border border-rule">
        {boards.map(board => {
          const rows = leaderboard(players, board);
          return (
            <section key={board.key} className="bg-paper">
              <h4 className="eyebrow text-ink-mute px-3 pt-2.5 pb-1.5">{board.label}</h4>
              {rows.length === 0 ? (
                <p className="text-tiny text-ink-faint px-3 pb-3">Nobody qualifies.</p>
              ) : (
                <ol className="pb-1">
                  {rows.map((row, i) => {
                    const team = teamFor(row.player.teamId);
                    return (
                      <li key={row.player.id} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="stat text-tiny text-ink-faint w-3">{i + 1}</span>
                        <TeamMark team={team} size={18} />
                        <span className="flex-1 min-w-0 truncate text-sm">
                          <PlayerLink name={row.player.name} />
                        </span>
                        <span className="stat text-sm font-semibold">{board.format(row.value)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
