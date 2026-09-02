'use client';

import React from 'react';
import Link from 'next/link';
import { teamSlug } from '../../lib/domain/core';
import { playerSlug } from '../../lib/domain/awards';
import { usePlayerSlugs } from '../../lib/LeagueContext';

function logoSrc(team) {
  if (!team || !team.logoUrl) return null;
  if (String(team.logoUrl).startsWith('data:')) {
    return team.id ? `/api/team-logo/${encodeURIComponent(team.id)}` : null;
  }
  return team.logoUrl;
}

export function TeamMark({ team, size = 20 }) {
  if (!team) {
    return <span className="inline-block bg-paper-sunk" style={{ width: size, height: size }} />;
  }
  const src = logoSrc(team);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="object-contain flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 font-display font-bold text-white"
      style={{ width: size, height: size, background: team.color || '#0C2340', fontSize: size * 0.42 }}
    >
      {(team.abbr || team.name || '?').slice(0, 3).toUpperCase()}
    </span>
  );
}

export function TeamLink({ team, children, className = '' }) {
  if (!team) return <span className={className}>TBD</span>;
  const slug = team.slug || teamSlug(team.name || team.displayName);
  return (
    <Link href={`/teams/${slug}`} className={`hover:text-brick ${className}`}>
      {children || team.name || team.displayName}
    </Link>
  );
}

const DISCORD_EMOJI_RE = /<a?:([A-Za-z0-9_~]+):\d+>/g;

export function cleanDiscordText(text) {
  return String(text == null ? '' : text)
    .replace(DISCORD_EMOJI_RE, '')
    .replace(/[*_]{2,}/g, '')
    .split(/\r?\n/)
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function PlayerLink({ name, slug, className = '' }) {
  const known = usePlayerSlugs();
  if (!name) return <span className={className}>Unknown player</span>;
  const target = slug || playerSlug(name);
  if (!known || !known.has(target)) return <span className={className}>{name}</span>;
  return (
    <Link href={`/players/${target}`} className={`hover:text-brick ${className}`}>
      {name}
    </Link>
  );
}

export function SectionHead({ title, href, linkLabel = 'Full page', children }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-1.5 mb-3">
      <h2 className="headline text-xl">{title}</h2>
      {children}
      {href && (
        <Link href={href} className="eyebrow text-ink-mute hover:text-brick whitespace-nowrap pb-0.5">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function EmptyNote({ children }) {
  return <p className="text-sm text-ink-mute py-6 px-4">{children}</p>;
}

const ET = 'America/New_York';

export function formatGameDate(ms) {
  if (ms == null) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ET, weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(ms));
}

export function formatGameTime(ms) {
  if (ms == null) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ET, hour: 'numeric', minute: '2-digit',
  }).format(new Date(ms)) + ' ET';
}

export function pct(value) {
  return value.toFixed(3).replace(/^0/, '');
}

export function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

export function roundLabel(game) {
  if (game.isPlayoff) {
    return `Playoffs R${game.playoffRound}${game.seriesGame ? ` · G${game.seriesGame}` : ''}`;
  }
  return game.date || 'Regular season';
}
