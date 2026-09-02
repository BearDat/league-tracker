'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

const PANEL = 'var(--lt-panel, #161616)';
const PANEL2 = 'var(--lt-panel2, #202020)';
const LINE = 'var(--lt-line, #3A3A3A)';
const CHALK = 'var(--lt-chalk, #F5F5F5)';
const CHALK_DIM = 'var(--lt-chalk-dim, #A0A0A0)';
const PRIMARY = 'var(--lt-primary, #2DD4BF)';
const INK = 'var(--lt-ink, #0A0A0A)';
const GOLD = '#F5C64B';
const WIN = '#4ADE80';
const NEGATIVE = '#FB7166';

const KIND_LABELS = {
  final_score: 'Final score',
  game_time: 'Game time',
  trade: 'Trade',
  sign: 'Signing',
  release: 'Release',
  suspend: 'Suspension',
  unsuspend: 'Suspension lifted',
  ban: 'Ban',
  unban: 'Ban lifted',
  unparsed: 'Unrecognized',
};

const CHANNEL_LABELS = {
  final_scores: '#final-scores',
  transactions: '#transactions',
  suspensions: '#suspensions',
  game_times: '#game-times',
};

function Panel({ children, className = '', style = {} }) {
  return (
    <div className={`rounded-lg ${className}`} style={{ background: PANEL, border: `1px solid ${LINE}`, ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
      <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: PRIMARY }}>{children}</h3>
      {right}
    </div>
  );
}

function relativeTime(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function jumpUrl(row) {
  return `https://discord.com/channels/${row.guild_id || '@me'}/${row.channel_id}/${row.message_id}`;
}

function DetailRows({ display }) {
  if (!display) return null;
  const rows = [];
  if (display.game) rows.push(['Game', display.game]);
  if (display.result) rows.push(['Result', display.result]);
  if (display.left) rows.push(['Left', display.left]);
  if (display.right) rows.push(['Right', display.right]);
  if (display.team) rows.push(['Team', display.team]);
  if (display.player) rows.push(['Player', display.player]);
  if (display.reason) rows.push(['Reason', display.reason]);
  if (display.when) rows.push(['Time', new Date(display.when).toLocaleString()]);
  (display.sides || []).forEach(s => rows.push(['Side', s]));
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {rows.map(([label, value], i) => (
        <div key={i} className="flex gap-2 text-xs">
          <span className="w-14 flex-shrink-0 uppercase" style={{ color: CHALK_DIM }}>{label}</span>
          <span style={{ color: CHALK }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function PendingCard({ row, onApprove, onReject, busy }) {
  const display = row.parsed && row.parsed.display;
  const reasons = Array.isArray(row.reasons) ? row.reasons : [];
  const canApply = !!(row.parsed && row.parsed.item);
  return (
    <div className="px-4 py-3" style={{ borderTop: `1px solid ${LINE}` }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded" style={{ background: PANEL2, color: GOLD }}>
            {KIND_LABELS[row.kind] || row.kind}
          </span>
          <span className="text-[10px]" style={{ color: CHALK_DIM }}>{relativeTime(row.created_at)}</span>
        </div>
        <a href={jumpUrl(row)} target="_blank" rel="noopener noreferrer" className="text-[10px] underline" style={{ color: CHALK_DIM }}>
          jump to message
        </a>
      </div>

      <div className="text-xs font-mono break-words" style={{ color: CHALK }}>{row.raw_text}</div>

      <DetailRows display={display} />

      {reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {reasons.map((r, i) => (
            <li key={i} className="text-xs" style={{ color: NEGATIVE }}>• {r}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => onApprove(row)}
          disabled={busy || !canApply}
          className="px-3 py-1.5 rounded text-xs font-bold disabled:opacity-40"
          style={{ background: canApply ? WIN : PANEL2, color: canApply ? INK : CHALK_DIM }}
        >
          {busy ? 'Applying…' : 'Approve'}
        </button>
        <button
          onClick={() => onReject(row)}
          disabled={busy}
          className="px-3 py-1.5 rounded text-xs font-bold disabled:opacity-40"
          style={{ background: PANEL2, color: CHALK, border: `1px solid ${LINE}` }}
        >
          Reject
        </button>
        {!canApply && (
          <span className="text-[10px]" style={{ color: CHALK_DIM }}>
            nothing concrete to apply — fix it by hand
          </span>
        )}
      </div>
    </div>
  );
}

export function BotHealthLine() {
  const [cursors, setCursors] = useState([]);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('bot_channel_cursor')
      .select('channel_id, updated_at')
      .then(({ data }) => {
        if (!cancelled && data) setCursors(data);
      });
    return () => { cancelled = true; };
  }, []);
  if (cursors.length === 0) return null;
  const newest = cursors.reduce((a, b) => (new Date(a.updated_at) > new Date(b.updated_at) ? a : b));
  const stale = Date.now() - new Date(newest.updated_at).getTime() > 3600000;
  return (
    <span className="text-[10px]" style={{ color: stale ? NEGATIVE : CHALK_DIM }}>
      bot last saw a message {relativeTime(newest.updated_at)}
    </span>
  );
}

export default function BotReviewPanel({ applyPending, onLogAudit }) {
  const { hasPermission } = useAuth();
  const canReview = hasPermission('manageRosterMoves');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('bot_pending')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);
    if (err) setError(err.message);
    else {
      setError(null);
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canReview) load();
  }, [canReview, load]);

  const close = useCallback(async (row, status, errorText) => {
    const { error: err } = await supabase
      .from('bot_pending')
      .update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: 'site',
        error: errorText || null,
      })
      .eq('id', row.id);
    if (err) {
      setError(err.message);
      return false;
    }
    setRows(prev => prev.filter(r => r.id !== row.id));
    return true;
  }, []);

  const onApprove = useCallback(async (row) => {
    setBusyId(row.id);
    setError(null);
    try {
      const result = await applyPending(row.kind, row.parsed.item);
      if (!result || !result.ok) {
        setError(result && result.error ? result.error : 'Could not apply that item.');
        setBusyId(null);
        return;
      }
      await close(row, 'applied', null);
      if (onLogAudit) onLogAudit('Bot item approved', `${KIND_LABELS[row.kind] || row.kind} — ${row.raw_text.slice(0, 200)}`);
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }, [applyPending, close, onLogAudit]);

  const onReject = useCallback(async (row) => {
    setBusyId(row.id);
    await close(row, 'ignored', null);
    setBusyId(null);
  }, [close]);

  if (!canReview) return null;

  return (
    <Panel className="overflow-hidden">
      <SectionTitle
        right={
          <div className="flex items-center gap-3">
            <BotHealthLine />
            <button onClick={load} className="text-[10px] underline" style={{ color: CHALK_DIM }}>refresh</button>
          </div>
        }
      >
        Bot review queue{rows.length > 0 ? ` (${rows.length})` : ''}
      </SectionTitle>

      <div className="px-4 pb-2">
        <p className="text-xs" style={{ color: CHALK_DIM }}>
          Lines the Discord bot parsed but would not write on its own. Approving runs the same action you would from the
          site; rejecting leaves the league untouched.
        </p>
      </div>

      {error && (
        <div className="mx-4 mb-2 px-3 py-2 rounded text-xs" style={{ background: PANEL2, color: NEGATIVE, border: `1px solid ${NEGATIVE}` }}>
          {error}
        </div>
      )}

      {loading ? (
        <p className="px-4 pb-4 text-sm" style={{ color: CHALK_DIM }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm" style={{ color: CHALK_DIM }}>Nothing waiting. Everything the bot saw was clear enough to apply on its own.</p>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto">
          {rows.map(row => (
            <PendingCard key={row.id} row={row} onApprove={onApprove} onReject={onReject} busy={busyId === row.id} />
          ))}
        </div>
      )}
    </Panel>
  );
}

export function BotEmojiPanel({ teamsById, season }) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('manageSettings');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newTeam, setNewTeam] = useState('');

  const teamOptions = useMemo(() => {
    const ids = [...new Set(((season && season.members) || []).map(m => m.teamId).filter(Boolean))];
    return ids
      .map(id => {
        const member = season.members.find(m => m.teamId === id);
        const rebrand = member && member.rebrand;
        const team = teamsById[id];
        return { teamId: id, name: (rebrand && rebrand.name) || (team && team.name) || 'Unknown team' };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [season, teamsById]);

  const nameFor = useCallback((teamId) => {
    const hit = teamOptions.find(t => t.teamId === teamId);
    return hit ? hit.name : teamId;
  }, [teamOptions]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('bot_team_emoji')
      .select('emoji_id, emoji_name, team_id, source, created_at')
      .order('emoji_name');
    if (err) setError(err.message);
    else {
      setError(null);
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (emojiId, emojiName, teamId) => {
    const { error: err } = await supabase.from('bot_team_emoji').upsert({
      emoji_id: emojiId,
      emoji_name: emojiName,
      team_id: teamId,
      source: 'site',
    });
    if (err) setError(err.message);
    else await load();
  }, [load]);

  const remove = useCallback(async (emojiId) => {
    const { error: err } = await supabase.from('bot_team_emoji').delete().eq('emoji_id', emojiId);
    if (err) setError(err.message);
    else await load();
  }, [load]);

  const addMapping = useCallback(async () => {
    const id = newId.trim();
    const parsed = id.match(/^<a?:([A-Za-z0-9_~]+):(\d+)>$/);
    const emojiId = parsed ? parsed[2] : id;
    const emojiName = parsed ? parsed[1] : (newName.trim() || `emoji-${emojiId}`);
    if (!/^\d+$/.test(emojiId) || !newTeam) {
      setError('Paste the emoji itself (it becomes <:Name:123…>) or its numeric id, and pick a team.');
      return;
    }
    await save(emojiId, emojiName, newTeam);
    setNewId('');
    setNewName('');
    setNewTeam('');
  }, [newId, newName, newTeam, save]);

  return (
    <Panel className="overflow-hidden">
      <SectionTitle right={<button onClick={load} className="text-[10px] underline" style={{ color: CHALK_DIM }}>refresh</button>}>
        Bot emoji mappings{rows.length > 0 ? ` (${rows.length})` : ''}
      </SectionTitle>

      <div className="px-4 pb-2">
        <p className="text-xs" style={{ color: CHALK_DIM }}>
          Which team each Discord emoji means. The bot learns exact name matches on its own and asks you about the rest —
          a team with two emoji just gets two rows here.
        </p>
      </div>

      {error && (
        <div className="mx-4 mb-2 px-3 py-2 rounded text-xs" style={{ background: PANEL2, color: NEGATIVE, border: `1px solid ${NEGATIVE}` }}>
          {error}
        </div>
      )}

      {loading ? (
        <p className="px-4 pb-4 text-sm" style={{ color: CHALK_DIM }}>Loading…</p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {rows.length === 0 && (
            <p className="px-4 pb-3 text-sm" style={{ color: CHALK_DIM }}>No mappings yet — the bot writes them as it learns.</p>
          )}
          {rows.map(row => (
            <div key={row.emoji_id} className="px-4 py-2 flex items-center gap-2" style={{ borderTop: `1px solid ${LINE}` }}>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: CHALK }}>:{row.emoji_name}:</div>
                <div className="text-[10px] font-mono truncate" style={{ color: CHALK_DIM }}>{row.emoji_id} · {row.source}</div>
              </div>
              {canEdit ? (
                <select
                  value={row.team_id}
                  onChange={e => save(row.emoji_id, row.emoji_name, e.target.value)}
                  className="bg-[#242424] border rounded px-2 py-1 text-xs"
                  style={{ borderColor: LINE, color: CHALK }}
                >
                  {teamOptions.every(t => t.teamId !== row.team_id) && (
                    <option value={row.team_id}>{row.team_id} (not in this season)</option>
                  )}
                  {teamOptions.map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
                </select>
              ) : (
                <span className="text-xs" style={{ color: CHALK }}>{nameFor(row.team_id)}</span>
              )}
              {canEdit && (
                <button onClick={() => remove(row.emoji_id)} className="text-xs px-2 py-1 rounded" style={{ color: NEGATIVE }}>
                  remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="px-4 py-3 flex flex-wrap items-center gap-2" style={{ borderTop: `1px solid ${LINE}` }}>
          <input
            value={newId}
            onChange={e => setNewId(e.target.value)}
            placeholder="Paste the emoji, or its id"
            className="flex-1 min-w-[12rem] bg-[#242424] border rounded px-2 py-1 text-xs"
            style={{ borderColor: LINE, color: CHALK }}
          />
          <select
            value={newTeam}
            onChange={e => setNewTeam(e.target.value)}
            className="bg-[#242424] border rounded px-2 py-1 text-xs"
            style={{ borderColor: LINE, color: CHALK }}
          >
            <option value="">Pick a team…</option>
            {teamOptions.map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
          </select>
          <button onClick={addMapping} className="px-3 py-1.5 rounded text-xs font-bold" style={{ background: PRIMARY, color: INK }}>
            Add
          </button>
        </div>
      )}
    </Panel>
  );
}
