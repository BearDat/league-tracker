'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useSeason, usePageTitle } from '../../../../lib/LeagueContext';
import { computeStandings, decorateGame } from '../../../../lib/domain/standings';
import { teamSlug } from '../../../../lib/domain/core';
import GameRow from '../../../../components/site/GameRow';
import { TeamMark, SectionHead, EmptyNote, PlayerLink, pct, signed } from '../../../../components/site/primitives';

function Stat({ label, value, tone }) {
  return (
    <div className="px-3 py-2.5">
      <div className="eyebrow text-ink-mute">{label}</div>
      <div className={`stat font-display font-bold text-2xl leading-tight mt-0.5 ${tone || 'text-ink'}`}>{value}</div>
    </div>
  );
}

function SplitRow({ label, value }) {
  return (
    <div className="flex justify-between px-3 py-2">
      <span className="text-ink-mute">{label}</span>
      <span className="stat">{value}</span>
    </div>
  );
}

export default function TeamPage() {
  const { slug } = useParams();
  const ctx = useSeason();
  const team = ctx
    ? computeStandings(ctx.season, ctx.teamsById).active
      .map(t => ({ ...t, slug: teamSlug(t.displayName) }))
      .find(t => t.slug === slug)
    : null;
  usePageTitle(team ? team.displayName : 'Team');

  if (!ctx) return <EmptyNote>No season is published yet.</EmptyNote>;
  const { season, teamsById } = ctx;
  const standings = computeStandings(season, teamsById).active;
  if (!team) return <EmptyNote>No team on this season has that name.</EmptyNote>;

  const games = (season.games || [])
    .filter(g => !g.isBye && (g.homeTeamId === team.id || g.awayTeamId === team.id))
    .map(g => decorateGame(g, season, teamsById));
  const results = games.filter(g => g.played).reverse().slice(0, 8);
  const upcoming = games.filter(g => !g.played).slice(0, 8);
  const roster = (team.roster || []).slice().sort((a, b) => {
    const av = typeof a.starLevel === 'number' ? a.starLevel : -1;
    const bv = typeof b.starLevel === 'number' ? b.starLevel : -1;
    return bv - av || String(a.name).localeCompare(String(b.name));
  });

  return (
    <div>
      <header className="card mb-6">
        <div className="h-1.5" style={{ background: team.color || '#0C2340' }} />
        <div className="flex items-center gap-4 p-4">
          <TeamMark team={{ ...team, name: team.displayName }} size={64} />
          <div className="min-w-0">
            <h1 className="headline text-3xl sm:text-4xl truncate">{team.displayName}</h1>
            <p className="eyebrow text-ink-mute mt-1">
              {season.name} · {team.rank} of {standings.length}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-rule border-t border-rule">
          <div className="bg-paper"><Stat label="Record" value={`${team.w}-${team.l}`} /></div>
          <div className="bg-paper"><Stat label="Win pct" value={pct(team.pct)} /></div>
          <div className="bg-paper">
            <Stat
              label="Run diff"
              value={signed(team.diff)}
              tone={team.diff > 0 ? 'text-win' : team.diff < 0 ? 'text-loss' : 'text-ink'}
            />
          </div>
          <div className="bg-paper"><Stat label="Streak" value={team.streak.label} /></div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_19rem] gap-8">
        <div className="min-w-0">
          <section className="mb-8">
            <SectionHead title="Results" />
            <div className="card row-rule">
              {results.length === 0
                ? <EmptyNote>No games played yet.</EmptyNote>
                : results.map(g => <GameRow key={g.id} game={g} />)}
            </div>
          </section>

          <section>
            <SectionHead title="Roster">
              <span className="eyebrow text-ink-mute pb-0.5">{roster.length} players</span>
            </SectionHead>
            <div className="card">
              {roster.length === 0 ? (
                <EmptyNote>No players on this roster.</EmptyNote>
              ) : (
                <table>
                  <thead>
                    <tr className="border-b border-rule-strong">
                      <th scope="col" className="eyebrow text-ink-mute text-left px-3 py-2">Player</th>
                      <th scope="col" className="eyebrow text-ink-mute text-right px-3 py-2">Rating</th>
                      <th scope="col" className="eyebrow text-ink-mute text-right px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map(p => (
                      <tr key={p.id} className="border-b border-rule last:border-b-0">
                        <td className="px-3 py-2 text-sm"><PlayerLink name={p.name} /></td>
                        <td className="px-3 py-2 text-sm stat text-right text-ink-soft">
                          {typeof p.starLevel === 'number' ? p.starLevel : 'R'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {p.banned ? (
                            <span className="eyebrow text-loss">Banned</span>
                          ) : p.suspended ? (
                            <span className="eyebrow text-brick">Suspended</span>
                          ) : (
                            <span className="eyebrow text-ink-faint">Active</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        <aside className="min-w-0">
          <SectionHead title="Upcoming" />
          <div className="card row-rule">
            {upcoming.length === 0
              ? <EmptyNote>Nothing scheduled.</EmptyNote>
              : upcoming.map(g => <GameRow key={g.id} game={g} />)}
          </div>

          <div className="mt-8">
            <SectionHead title="Splits" />
            <div className="card row-rule text-sm">
              <SplitRow label="Home" value={`${team.homeW}-${team.homeL}`} />
              <SplitRow label="Away" value={`${team.awayW}-${team.awayL}`} />
              <SplitRow label="Runs scored" value={team.rf} />
              <SplitRow label="Runs allowed" value={team.ra} />
              <SplitRow label="One-run games" value={`${team.oneRunW}-${team.oneRunL}`} />
              <SplitRow label="Longest win streak" value={team.longestWinStreak} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
