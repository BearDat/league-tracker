import React from 'react';
import { TeamMark, TeamLink, pct, signed } from './primitives';

function Th({ children, align = 'right', className = '' }) {
  return (
    <th
      scope="col"
      className={`eyebrow text-ink-mute font-bold px-2 py-2 ${align === 'left' ? 'text-left' : 'text-right'} ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'right', className = '' }) {
  return (
    <td className={`px-2 py-2 stat text-sm ${align === 'left' ? 'text-left' : 'text-right'} ${className}`}>
      {children}
    </td>
  );
}

function Last10({ results }) {
  if (!results || results.length === 0) return <span className="text-ink-faint">—</span>;
  const w = results.filter(r => r === 'W').length;
  return <span>{w}-{results.length - w}</span>;
}

export default function StandingsTable({ rows, playoffSpots, compact = false }) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-ink-mute px-3 py-6">No teams in this season yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr className="border-b border-rule-strong">
            <Th align="left" className="w-8">#</Th>
            <Th align="left">Team</Th>
            <Th>W</Th>
            <Th>L</Th>
            <Th>PCT</Th>
            <Th>GB</Th>
            {!compact && (
              <>
                <Th>RS</Th>
                <Th>RA</Th>
                <Th>DIFF</Th>
                <Th>HOME</Th>
                <Th>AWAY</Th>
                <Th>L10</Th>
                <Th>STRK</Th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const cutoff = playoffSpots && t.rank === playoffSpots;
            return (
              <tr
                key={t.id}
                className={`border-b border-rule hover:bg-paper-well ${cutoff ? 'border-b-2 border-b-ink' : ''}`}
              >
                <Td align="left" className="text-ink-faint">{t.rank}</Td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-1 h-6 flex-shrink-0" style={{ background: t.color || '#0C2340' }} />
                    <TeamMark team={{ ...t, name: t.displayName }} size={22} />
                    <TeamLink
                      team={{ ...t, name: t.displayName, slug: t.slug }}
                      className="text-sm font-medium truncate"
                    />
                  </div>
                </td>
                <Td className="font-semibold">{t.w}</Td>
                <Td className="text-ink-soft">{t.l}</Td>
                <Td>{pct(t.pct)}</Td>
                <Td className="text-ink-soft">{t.gb === 0 ? '—' : t.gb.toFixed(1)}</Td>
                {!compact && (
                  <>
                    <Td className="text-ink-soft">{t.rf}</Td>
                    <Td className="text-ink-soft">{t.ra}</Td>
                    <Td className={t.diff > 0 ? 'text-win' : t.diff < 0 ? 'text-loss' : 'text-ink-soft'}>
                      {signed(t.diff)}
                    </Td>
                    <Td className="text-ink-soft">{t.homeW}-{t.homeL}</Td>
                    <Td className="text-ink-soft">{t.awayW}-{t.awayL}</Td>
                    <Td className="text-ink-soft"><Last10 results={t.last10} /></Td>
                    <Td className={t.streak.type === 'W' ? 'text-win' : t.streak.type === 'L' ? 'text-loss' : 'text-ink-faint'}>
                      {t.streak.label}
                    </Td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
