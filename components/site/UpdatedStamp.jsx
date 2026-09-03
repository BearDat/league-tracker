'use client';

import React, { useEffect, useState } from 'react';
import { useLeague } from '../../lib/LeagueContext';

function stamp(value) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
}

export default function UpdatedStamp({ leagueName }) {
  const { snapshot, refreshing, staleSince, refresh } = useLeague();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const season = snapshot && (snapshot.seasons || []).find(s => s.id === snapshot.activeSeasonId);
  const updatedAt = snapshot && snapshot.updatedAt ? snapshot.updatedAt : null;

  return (
    <p className="text-tiny text-ink-mute flex items-center gap-2 flex-wrap">
      <span>
        {leagueName}{season ? ` · ${season.name}` : ''}
      </span>
      {mounted && updatedAt && (
        <span className="text-ink-faint">updated {stamp(updatedAt)} ET</span>
      )}
      {mounted && (
        <button
          type="button"
          onClick={() => refresh({})}
          className="eyebrow text-ink-faint hover:text-brick inline-flex items-center gap-1.5"
          title={staleSince ? 'Last refresh failed — click to try again' : 'Refreshes on its own every 60 seconds'}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              staleSince ? 'bg-loss' : refreshing ? 'bg-brick animate-pulse-dot' : 'bg-win'
            }`}
          />
          {staleSince ? 'Offline' : refreshing ? 'Syncing' : 'Live'}
        </button>
      )}
    </p>
  );
}
