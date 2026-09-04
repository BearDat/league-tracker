'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth, ROLE_LABELS, ROLE_PERMISSIONS, PERM_LABELS } from '../../lib/AuthContext';
import { EmptyNote } from '../site/primitives';

const ROLES = Object.keys(ROLE_LABELS);

export default function AdminsPanel() {
  const { role: myRole, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from('admin_roles').select('user_id, username, role').order('username');
    if (err) setError(err.message);
    else { setError(null); setRows(data || []); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const canManage = myRole === 'site_owner';

  const change = async (row, nextRole) => {
    setBusy(row.user_id);
    setError(null);
    const { error: err } = await supabase.from('admin_roles').update({ role: nextRole }).eq('user_id', row.user_id);
    if (err) setError(err.message);
    else await load();
    setBusy(null);
  };

  const revoke = async (row) => {
    if (!confirm(`Revoke ${row.username}'s ${ROLE_LABELS[row.role] || row.role} access?`)) return;
    setBusy(row.user_id);
    setError(null);
    const { error: err } = await supabase.from('admin_roles').delete().eq('user_id', row.user_id);
    if (err) setError(err.message);
    else await load();
    setBusy(null);
  };

  return (
    <div>
      <section className="card">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-rule-strong">
          <h2 className="headline text-lg">Admins</h2>
          <button type="button" onClick={load} className="eyebrow text-ink-mute hover:text-brick">Refresh</button>
        </div>

        {error && <p className="text-sm text-loss px-3 pt-3">{error}</p>}
        {!canManage && (
          <p className="text-tiny text-ink-mute px-3 pt-3">
            Only a Site Owner can change roles. You can see who has access.
          </p>
        )}

        {loading && rows.length === 0 && <EmptyNote>Loading…</EmptyNote>}
        {!loading && rows.length === 0 && <EmptyNote>No admin accounts found.</EmptyNote>}

        <div className="row-rule">
          {rows.map(row => {
            const isMe = user && row.user_id === user.id;
            return (
              <div key={row.user_id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="text-sm font-medium flex-1 min-w-[8rem] truncate">
                  {row.username}{isMe && <span className="eyebrow text-ink-faint ml-2">you</span>}
                </span>
                {canManage && !isMe ? (
                  <select
                    value={row.role}
                    disabled={busy === row.user_id}
                    onChange={e => change(row, e.target.value)}
                    className="bg-paper-well border border-rule px-2 py-1 text-tiny"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                ) : (
                  <span className="eyebrow text-ink-mute">{ROLE_LABELS[row.role] || row.role}</span>
                )}
                {canManage && !isMe && (
                  <button
                    type="button"
                    disabled={busy === row.user_id}
                    onClick={() => revoke(row)}
                    className="eyebrow text-loss hover:underline disabled:opacity-40"
                  >
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-tiny text-ink-faint px-3 py-2.5 border-t border-rule">
          New accounts are created in the Supabase dashboard as
          {' '}<span className="stat">username@admin.local</span>, then granted a role here.
        </p>
      </section>

      <section className="card mt-6">
        <h2 className="headline text-lg px-3 py-2.5 border-b border-rule-strong">What each role can do</h2>
        <div className="row-rule">
          {ROLES.map(r => (
            <div key={r} className="px-3 py-2.5">
              <p className="text-sm font-medium">{ROLE_LABELS[r]}</p>
              <p className="text-tiny text-ink-mute mt-0.5">
                {(ROLE_PERMISSIONS[r] || []).map(p => PERM_LABELS[p]).join(' · ') || 'No permissions'}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
