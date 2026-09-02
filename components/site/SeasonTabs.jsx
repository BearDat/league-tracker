'use client';

import React from 'react';

export default function SeasonTabs({ seasons, activeId, onSelect }) {
  if (!seasons || seasons.length < 2) return null;
  return (
    <div className="flex items-stretch gap-px bg-rule border border-rule mb-4 overflow-x-auto">
      {seasons.map(season => {
        const active = season.id === activeId;
        return (
          <button
            key={season.id}
            type="button"
            onClick={() => onSelect(season.id)}
            className={`eyebrow px-3 py-2 whitespace-nowrap transition-colors ${
              active ? 'bg-navy text-white' : 'bg-paper text-ink-mute hover:text-brick'
            }`}
          >
            {season.name}
          </button>
        );
      })}
    </div>
  );
}
