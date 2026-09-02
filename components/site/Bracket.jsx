import React from 'react';
import { TeamMark, TeamLink } from './primitives';

function SeriesTeam({ entry, winsNeeded, decided }) {
  const { team, wins, isWinner } = entry;
  const dim = decided && !isWinner;
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1.5">
      <span
        className="w-1 self-stretch flex-shrink-0 transition-opacity"
        style={{ background: team ? (team.color || 'rgb(var(--c-accent))') : 'transparent', opacity: dim ? 0.35 : 1 }}
      />
      <TeamMark team={team} size={22} />
      <TeamLink
        team={team}
        className={`flex-1 min-w-0 truncate text-sm ${dim ? 'text-ink-mute' : 'text-ink font-medium'}`}
      />
      <span className="flex items-center gap-1.5">
        {Array.from({ length: winsNeeded }).map((_, i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: i < wins ? (team && team.color) || 'rgb(var(--c-accent))' : 'rgb(var(--c-line-strong))',
            }}
          />
        ))}
        <span className={`stat text-base w-5 text-right ${isWinner ? 'font-bold text-ink' : 'text-ink-soft'}`}>
          {wins}
        </span>
      </span>
    </div>
  );
}

function SeriesCard({ series }) {
  if (series.isBye) {
    return (
      <div className="card">
        <div className="px-2.5 py-2 eyebrow text-ink-faint">Bye</div>
        {series.teams.map(entry => (
          <SeriesTeam key={entry.team ? entry.team.id : 'tbd'} entry={entry} winsNeeded={series.winsNeeded} decided />
        ))}
      </div>
    );
  }

  const played = series.games.filter(g => g.played).length;
  const status = series.decided
    ? 'Series over'
    : played === 0
      ? `Best of ${series.seriesLength}`
      : `Game ${played + 1} of ${series.seriesLength}`;

  return (
    <div className="card transition-colors hover:border-rule-strong">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-rule">
        <span className="eyebrow text-ink-faint">Best of {series.seriesLength}</span>
        <span className={`eyebrow ${series.decided ? 'text-ink-mute' : 'text-brick'}`}>{status}</span>
      </div>
      {series.teams.length === 0 ? (
        <div className="px-2.5 py-3 text-sm text-ink-faint">To be determined</div>
      ) : (
        series.teams.map(entry => (
          <SeriesTeam
            key={entry.team ? entry.team.id : `tbd-${entry.wins}`}
            entry={entry}
            winsNeeded={series.winsNeeded}
            decided={series.decided}
          />
        ))
      )}
    </div>
  );
}

export default function Bracket({ bracket, compact = false }) {
  if (!bracket || !bracket.active) return null;
  const rounds = compact ? bracket.rounds.slice(-2) : bracket.rounds;

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex gap-5 min-w-max stagger">
        {rounds.map(round => (
          <section key={round.round} className="min-w-[17rem] flex-1">
            <div className="flex items-baseline justify-between border-b border-rule-strong pb-1 mb-2.5">
              <h3 className="eyebrow text-ink">{round.name}</h3>
              {round.complete && <span className="eyebrow text-ink-faint">Complete</span>}
            </div>
            <div className="space-y-2.5">
              {round.series.map(s => <SeriesCard key={s.slot} series={s} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
