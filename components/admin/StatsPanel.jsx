'use client';

import React, { useMemo, useState } from 'react';
import { useAdminLeague } from '../../lib/AdminLeagueContext';
import { useLeague } from '../../lib/LeagueContext';
import { upsertManualStatLine, removeStatLine } from '../../lib/domain/mutations';
import { teamDisplayName } from '../../lib/domain/core';
import { EmptyNote } from '../site/primitives';

const BATTING = [
  ['g', 'G'], ['ab', 'AB'], ['r', 'R'], ['h', 'H'], ['doubles', '2B'],
  ['triples', '3B'], ['hr', 'HR'], ['rbi', 'RBI'], ['bb', 'BB'], ['so', 'SO'],
];
const PITCHING = [
  ['ip', 'IP'], ['ha', 'H'], ['er', 'ER'], ['bbAllowed', 'BB'], ['k', 'K'], ['hrAllowed', 'HR'], ['e', 'E'],
];
const FIELDS = [...BATTING, ...PITCHING];

function blankForm() {
  const out = {};
  FIELDS.forEach(([key]) => { out[key] = ''; });
  return out;
}

function formFromLine(line) {
  const out = blankForm();
  if (!line) return out;
  FIELDS.forEach(([key]) => {
    if (line[key] !== undefined && line[key] !== null) out[key] = String(line[key]);
  });
  return out;
}

export default function StatsPanel() {
  const { league, mutate, saving } = useAdminLeague();
  const { snapshot } = useLeague();
  const teams = (snapshot && snapshot.teams) || {};
  const [seasonId, setSeasonId] = useState(null);
  const [playerId, setPlayerId] = useState('');
  const [isPlayoff, setIsPlayoff] = useState(false);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(blankForm());

  const seasons = (league && league.seasons) || [];
  const season = seasons.find(s => s.id === (seasonId || (league && league.activeSeasonId))) || seasons[0];

  const players = useMemo(() => {
    if (!season) return [];
    const out = [];
    (season.members || []).forEach(m => (m.roster || []).forEach(p => out.push({
      id: p.id, name: p.name, teamName: teamDisplayName(m.teamId, season, teams),
    })));
    (season.freeAgents || []).forEach(p => out.push({ id: p.id, name: p.name, teamName: 'Free agent' }));
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [season, teams]);

  const shown = query.trim()
    ? players.filter(p => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : players;

  const existing = useMemo(() => {
    if (!season || !playerId) return null;
    return (season.importedStatLines || []).find(
      l => l.source === 'manual' && l.playerId === playerId && !!l.isPlayoff === isPlayoff,
    ) || null;
  }, [season, playerId, isPlayoff]);

  const selectPlayer = (id) => {
    setPlayerId(id);
    const line = season
      ? (season.importedStatLines || []).find(l => l.source === 'manual' && l.playerId === id && !!l.isPlayoff === isPlayoff)
      : null;
    setForm(formFromLine(line));
  };

  const togglePlayoff = (next) => {
    setIsPlayoff(next);
    const line = season && playerId
      ? (season.importedStatLines || []).find(l => l.source === 'manual' && l.playerId === playerId && !!l.isPlayoff === next)
      : null;
    setForm(formFromLine(line));
  };

  if (!league || !season) return <EmptyNote>No season is loaded.</EmptyNote>;

  const imported = (season.importedStatLines || []);
  const manual = imported.filter(l => l.source === 'manual');
  const nameOf = (id) => {
    const p = players.find(x => x.id === id);
    return p ? p.name : id;
  };

  const submit = async () => {
    const fields = {};
    FIELDS.forEach(([key]) => {
      if (form[key] === '') return;
      fields[key] = key === 'ip' ? form[key] : Number(form[key]) || 0;
    });
    await mutate(upsertManualStatLine(season.id, playerId, { ...fields, isPlayoff }));
  };

  return (
    <div>
      <section className="card">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-rule-strong flex-wrap">
          <h2 className="headline text-lg">Stat lines</h2>
          <div className="flex items-center gap-2">
            <label className="eyebrow text-ink-mute flex items-center gap-1.5">
              <input type="checkbox" checked={isPlayoff} onChange={e => togglePlayoff(e.target.checked)} />
              Playoffs
            </label>
            <select
              value={season.id}
              onChange={e => { setSeasonId(e.target.value); setPlayerId(''); setForm(blankForm()); }}
              className="bg-paper-well border border-rule px-2 py-1.5 text-sm"
            >
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="px-3 py-2.5 border-b border-rule">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search players"
            className="w-full bg-paper-well border border-rule px-2 py-1.5 text-sm"
          />
          <div className="flex flex-wrap gap-1.5 mt-2 max-h-32 overflow-y-auto">
            {shown.slice(0, 60).map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPlayer(p.id)}
                className={`text-tiny border px-2 py-1 ${
                  p.id === playerId ? 'border-brick bg-brand-soft' : 'border-rule bg-paper hover:border-brick'
                }`}
              >
                {p.name} <span className="text-ink-faint">{p.teamName}</span>
              </button>
            ))}
            {shown.length === 0 && <span className="text-tiny text-ink-faint">No player matches.</span>}
          </div>
        </div>

        {!playerId ? (
          <EmptyNote>Pick a player to enter their {isPlayoff ? 'playoff' : 'regular season'} line.</EmptyNote>
        ) : (
          <div className="px-3 py-3">
            <p className="eyebrow text-ink-mute mb-2">
              {nameOf(playerId)} · {season.name} · {isPlayoff ? 'Playoffs' : 'Regular season'}
              {existing ? ' · editing existing line' : ' · new line'}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-9 gap-2">
              {FIELDS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="eyebrow text-ink-faint">{label}</span>
                  <input
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    inputMode={key === 'ip' ? 'decimal' : 'numeric'}
                    className="mt-0.5 w-full bg-paper-well border border-rule px-1.5 py-1 text-sm stat text-right"
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                disabled={saving}
                onClick={submit}
                className="eyebrow bg-navy text-white px-3 py-2 disabled:opacity-40"
              >
                {existing ? 'Update line' : 'Save line'}
              </button>
              {existing && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    const r = await mutate(removeStatLine(season.id, existing.id));
                    if (r.ok) setForm(blankForm());
                  }}
                  className="eyebrow border border-loss text-loss px-3 py-2 disabled:opacity-40"
                >
                  Delete line
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="card mt-6">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-rule-strong">
          <h2 className="headline text-lg">Manual lines in {season.name}</h2>
          <span className="eyebrow text-ink-mute">{manual.length} of {imported.length} imported</span>
        </div>
        {manual.length === 0 ? (
          <EmptyNote>No hand-entered lines in this season.</EmptyNote>
        ) : (
          <div className="row-rule">
            {manual.map(line => (
              <div key={line.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 min-w-0 truncate">{nameOf(line.playerId)}</span>
                <span className="stat text-tiny text-ink-mute">
                  {line.ab || 0} AB · {line.h || 0} H · {line.hr || 0} HR · {line.ip || 0} IP
                </span>
                {line.isPlayoff && <span className="eyebrow text-brick">POST</span>}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => { if (confirm(`Remove the stat line for ${nameOf(line.playerId)}?`)) mutate(removeStatLine(season.id, line.id)); }}
                  className="eyebrow text-loss hover:underline disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
