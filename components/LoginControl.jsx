'use client';

import React, { useState } from 'react';
import { LogIn, LogOut, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

// Header auth control: a small "Log in" button that opens an email/password
// form in a popover, or "Log out" once a session exists. Kept deliberately
// separate from LeagueTracker.jsx so the ported file's own code stays a pure
// diff against the original — this is new UI, not a modification of existing UI.
export default function LoginControl({ chalk, chalkDim, primary, ink, panel, panel2, line }) {
  const { isLoggedIn, user, login, logout, authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (authLoading) return null;

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await login(email, password);
    setSubmitting(false);
    if (err) { setError(err); return; }
    setOpen(false);
    setEmail('');
    setPassword('');
  };

  if (isLoggedIn) {
    return (
      <button
        onClick={logout}
        title={user?.email || 'Log out'}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wide transition-colors flex-shrink-0"
        style={{ color: chalkDim, border: `1px solid ${line}` }}
      >
        <LogOut size={13} />
        Log out
      </button>
    );
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wide transition-colors"
        style={{ color: ink, background: primary }}
      >
        <LogIn size={13} />
        Log in
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 rounded-xl border p-4 w-64 shadow-xl"
          style={{ background: panel, borderColor: line }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: chalk }}>Admin log in</span>
            <button onClick={() => setOpen(false)} style={{ color: chalkDim }}><X size={14} /></button>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <input
              type="email" required autoComplete="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-2 py-1.5 rounded text-sm border"
              style={{ background: panel2, borderColor: line, color: chalk }}
            />
            <input
              type="password" required autoComplete="current-password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="px-2 py-1.5 rounded text-sm border"
              style={{ background: panel2, borderColor: line, color: chalk }}
            />
            {error && <div className="text-xs" style={{ color: '#FB7166' }}>{error}</div>}
            <button
              type="submit" disabled={submitting}
              className="mt-1 px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide disabled:opacity-60"
              style={{ color: ink, background: primary }}
            >
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
