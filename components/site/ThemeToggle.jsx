'use client';

import React, { useEffect, useState } from 'react';

const KEY = 'kpb-theme';

function apply(mode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export default function ThemeToggle() {
  const [mode, setMode] = useState('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored = 'system';
    try {
      stored = localStorage.getItem(KEY) || 'system';
    } catch (e) {
      stored = 'system';
    }
    setMode(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    apply(mode);
    try {
      if (mode === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch (e) {
      /* storage unavailable */
    }
  }, [mode, ready]);

  useEffect(() => {
    if (mode !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const next = mode === 'dark' ? 'light' : 'dark';
  const label = mode === 'dark' ? 'Dark' : mode === 'light' ? 'Light' : 'Auto';

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Theme: ${label}`}
      className="eyebrow text-white/70 hover:text-white border border-white/25 px-2.5 py-1.5 leading-none transition-colors"
    >
      {label}
    </button>
  );
}
