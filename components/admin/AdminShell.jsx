'use client';

import React, { useState } from 'react';
import { useAuth, ROLE_LABELS } from '../../lib/AuthContext';
import { useAdminLeague } from '../../lib/AdminLeagueContext';
import { EmptyNote } from '../site/primitives';

function LoginCard() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await login(username, password);
    if (err) setError(err);
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="card max-w-sm mx-auto mt-10 overflow-hidden">
      <div className="brand-rule" />
      <div className="p-5">
        <h1 className="headline text-2xl">Admin sign in</h1>
        <p className="text-sm text-ink-mute mt-1">League staff only.</p>
        <label className="block mt-4">
          <span className="eyebrow text-ink-mute">Username</span>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            className="mt-1 w-full bg-paper-well border border-rule px-3 py-2 text-sm"
          />
        </label>
        <label className="block mt-3">
          <span className="eyebrow text-ink-mute">Password</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full bg-paper-well border border-rule px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-sm text-loss mt-3">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="mt-4 w-full eyebrow bg-navy text-white px-3 py-2.5 disabled:opacity-40"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}

function ConflictBanner() {
  const { conflict, forceConflict, dismissConflict, saving } = useAdminLeague();
  if (!conflict) return null;
  return (
    <div className="card border-loss mb-4 overflow-hidden">
      <div className="h-1 bg-loss" />
      <div className="p-3">
        <p className="text-sm font-medium">Someone else saved while you were editing.</p>
        <p className="text-sm text-ink-mute mt-1">
          Your change was not written. Reload to pick up theirs and try again, or overwrite it.
        </p>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={dismissConflict}
            disabled={saving}
            className="eyebrow bg-navy text-white px-3 py-2 disabled:opacity-40"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={forceConflict}
            disabled={saving}
            className="eyebrow border border-loss text-loss px-3 py-2 disabled:opacity-40"
          >
            Overwrite anyway
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminShell({ tabs }) {
  const { isLoggedIn, authLoading, role, roleLoading, logout } = useAuth();
  const { league, loading, error, saving, savedAt } = useAdminLeague();
  const [active, setActive] = useState(tabs[0].key);

  if (authLoading) return <EmptyNote>Checking your session…</EmptyNote>;
  if (!isLoggedIn) return <LoginCard />;
  if (roleLoading) return <EmptyNote>Loading your permissions…</EmptyNote>;
  if (!role) {
    return (
      <div className="max-w-sm mx-auto mt-10 text-center">
        <EmptyNote>This account has no admin role assigned.</EmptyNote>
        <button type="button" onClick={logout} className="eyebrow text-ink-mute hover:text-brick">Sign out</button>
      </div>
    );
  }

  const visible = tabs.filter(t => !t.perm || t.allowed);
  const current = visible.find(t => t.key === active) || visible[0];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink pb-1.5 mb-4">
        <h1 className="headline text-xl">Admin</h1>
        <div className="flex items-center gap-3">
          {saving && <span className="eyebrow text-brick">Saving…</span>}
          {!saving && savedAt && <span className="eyebrow text-win">Saved</span>}
          <span className="eyebrow text-ink-mute">{ROLE_LABELS[role] || role}</span>
          <button type="button" onClick={logout} className="eyebrow text-ink-mute hover:text-brick">Sign out</button>
        </div>
      </div>

      <div className="flex items-stretch gap-px bg-rule border border-rule mb-4 overflow-x-auto">
        {visible.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`eyebrow px-3 py-2 whitespace-nowrap transition-colors ${
              tab.key === current.key ? 'bg-navy text-white' : 'bg-paper text-ink-mute hover:text-brick'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ConflictBanner />
      {error && <p className="text-sm text-loss mb-3">{error}</p>}

      {loading && !league
        ? <EmptyNote>Loading the league…</EmptyNote>
        : current
          ? current.render()
          : <EmptyNote>Your role has no admin panels.</EmptyNote>}
    </div>
  );
}
