'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAdminLeague } from '../../lib/AdminLeagueContext';
import { applyPendingItem, canApply } from '../../lib/domain/applyPending';
import { EmptyNote } from '../site/primitives';

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
  awards: 'Season awards',
  unparsed: 'Unrecognized line',
};

function relative(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function jumpUrl(row) {
  return `https://discord.com/channels/${row.guild_id || '@me'}/${row.channel_id}/${row.message_id}`;
}

function Details({ display }) {
  if (!display) return null;
  const rows = [];
  if (display.season) rows.push(['Season', display.season]);
  if (display.game) rows.push(['Game', display.game]);
  if (display.result) rows.push(['Result', display.result]);
  if (display.left) rows.push(['Left', display.left]);
  if (display.right) rows.push(['Right', display.right]);
  if (display.team) rows.push(['Team', display.team]);
  if (display.player) rows.push(['Player', display.player]);
  if (display.reason) rows.push(['Reason', display.reason]);
  if (display.when) rows.push(['Time', new Date(display.when).toLocaleString()]);
  (display.sides || []).forEach(s => rows.push(['Side', s]));
  (display.awards || []).forEach(a => rows.push(['Award', a]));
  if (rows.length === 0) return null;
  return (
    <dl className="mt-2 space-y-0.5">
      {rows.map(([label, value], i) => (
        <div key={i} className="flex gap-2 text-tiny">
          <dt className="eyebrow text-ink-faint w-14 flex-shrink-0">{label}</dt>
          <dd className="text-ink-soft min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BotHealth() {
  const [newest, setNewest] = useState(null);
  useEffect(() => {
    let cancelled = false;
    supabase.from('bot_channel_cursor').select('channel_id, updated_at').then(({ data }) => {
      if (cancelled || !data || data.length === 0) return;
      setNewest(data.reduce((a, b) => (new Date(a.updated_at) > new Date(b.updated_at) ? a : b)).updated_at);
    });
    return () => { cancelled = true; };
  }, []);
  if (!newest) return null;
  const stale = Date.now() - new Date(newest).getTime() > 3600000;
  return (
    <span className={`eyebrow ${stale ? 'text-loss' : 'text-ink-faint'}`}>
      bot last saw a message {relative(newest)}
    </span>
  );
}

function EmojiMappings() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('bot_team_emoji').select('emoji_id, emoji_name, team_id, source').order('emoji_name');
    setRows(data || []);
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const remove = async (emojiId) => {
    await supabase.from('bot_team_emoji').delete().eq('emoji_id', emojiId);
    load();
  };

  return (
    <section className="card mt-6">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 border-b border-rule-strong"
      >
        <span className="headline text-lg">Emoji mappings</span>
        <span className="eyebrow text-ink-mute">{open ? 'Hide' : 'Show'}{rows.length ? ` · ${rows.length}` : ''}</span>
      </button>
      {open && (
        rows.length === 0
          ? <EmptyNote>No emoji have been mapped yet.</EmptyNote>
          : (
            <div className="row-rule">
              {rows.map(row => (
                <div key={row.emoji_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-medium min-w-0 truncate">:{row.emoji_name}:</span>
                  <span className="stat text-tiny text-ink-faint flex-1 min-w-0 truncate">{row.team_id}</span>
                  <span className="eyebrow text-ink-faint">{row.source}</span>
                  <button type="button" onClick={() => remove(row.emoji_id)} className="eyebrow text-loss hover:underline">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )
      )}
    </section>
  );
}

export default function QueuePanel() {
  const { mutate, seedById } = useAdminLeague();
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

  useEffect(() => { load(); }, [load]);

  const close = async (row, status) => {
    const { error: err } = await supabase.from('bot_pending').update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: 'site',
    }).eq('id', row.id);
    if (err) {
      setError(err.message);
      return false;
    }
    setRows(prev => prev.filter(r => r.id !== row.id));
    return true;
  };

  const approve = async (row) => {
    setBusyId(row.id);
    setError(null);
    try {
      const item = row.parsed && row.parsed.item;
      const result = await mutate(applyPendingItem(row.kind, item, seedById));
      if (result.ok) await close(row, 'applied');
      else if (!result.conflict) setError(result.error || 'Could not apply that item.');
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  };

  const reject = async (row) => {
    setBusyId(row.id);
    await close(row, 'ignored');
    setBusyId(null);
  };

  return (
    <div>
      <section className="card">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-rule-strong">
          <h2 className="headline text-lg">Review queue{rows.length > 0 ? ` · ${rows.length}` : ''}</h2>
          <div className="flex items-center gap-3">
            <BotHealth />
            <button type="button" onClick={load} className="eyebrow text-ink-mute hover:text-brick">Refresh</button>
          </div>
        </div>

        {error && <p className="text-sm text-loss px-3 pt-3">{error}</p>}

        {loading && rows.length === 0 && <EmptyNote>Loading…</EmptyNote>}
        {!loading && rows.length === 0 && (
          <EmptyNote>Nothing waiting. The bot writes anything it is sure about on its own.</EmptyNote>
        )}

        <div className="row-rule">
          {rows.map(row => {
            const item = row.parsed && row.parsed.item;
            const appliable = !!item && canApply(row.kind);
            return (
              <article key={row.id} className="px-3 py-3">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="eyebrow bg-paper-sunk text-ink px-1.5 py-0.5">{KIND_LABELS[row.kind] || row.kind}</span>
                    <span className="text-tiny text-ink-faint">{relative(row.created_at)}</span>
                  </div>
                  <a
                    href={jumpUrl(row)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="eyebrow text-ink-mute hover:text-brick"
                  >
                    Jump to message
                  </a>
                </div>

                <p className="stat text-tiny text-ink-soft whitespace-pre-line break-words">{row.raw_text}</p>
                <Details display={row.parsed && row.parsed.display} />

                {(row.reasons || []).length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {row.reasons.map((r, i) => <li key={i} className="text-tiny text-loss">• {r}</li>)}
                  </ul>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => approve(row)}
                    disabled={busyId === row.id || !appliable}
                    className="eyebrow bg-navy text-white px-3 py-2 disabled:opacity-40"
                  >
                    {busyId === row.id ? 'Applying…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(row)}
                    disabled={busyId === row.id}
                    className="eyebrow border border-rule px-3 py-2 disabled:opacity-40"
                  >
                    Reject
                  </button>
                  {!appliable && (
                    <span className="text-tiny text-ink-faint">nothing concrete to apply — fix it by hand</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <EmojiMappings />
    </div>
  );
}
