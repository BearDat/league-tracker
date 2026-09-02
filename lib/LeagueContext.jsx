'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getActiveSeason, mergeTeam, teamSlug } from './domain/core';
import { playerSlugIndex } from './domain/awards';

const REFRESH_MS = 60000;
const CACHE_KEY = 'kpb-snapshot';

const LeagueCtx = createContext(null);

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeCache(snapshot) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    /* quota or private mode — the in-memory copy still serves this session */
  }
}

export function LeagueProvider({ initial, children }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [staleSince, setStaleSince] = useState(null);
  const lastFetch = useRef(initial ? Date.now() : 0);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (snapshot) return;
    const cached = readCache();
    if (cached) setSnapshot(cached);
  }, [snapshot]);

  const refresh = useCallback(async () => {
    lastFetch.current = Date.now();
    setRefreshing(true);
    try {
      const res = await fetch('/api/league-snapshot', { cache: 'no-store' });
      if (!res.ok) throw new Error(`snapshot request failed (${res.status})`);
      const next = await res.json();
      if (!active.current) return;
      setSnapshot(next);
      setStaleSince(null);
      writeCache(next);
    } catch (e) {
      if (active.current) setStaleSince(prev => prev || Date.now());
    } finally {
      if (active.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const due = () => Date.now() - lastFetch.current >= REFRESH_MS;
    const tick = () => {
      if (document.hidden || !due()) return;
      refresh();
    };
    const timer = setInterval(tick, 5000);
    const onWake = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [refresh]);

  const playerSlugs = useMemo(() => playerSlugIndex(snapshot), [snapshot]);
  const value = useMemo(
    () => ({ snapshot, playerSlugs, refresh, refreshing, staleSince }),
    [snapshot, playerSlugs, refresh, refreshing, staleSince],
  );
  return <LeagueCtx.Provider value={value}>{children}</LeagueCtx.Provider>;
}

export function useLeague() {
  const ctx = useContext(LeagueCtx);
  if (!ctx) throw new Error('useLeague must be used inside a LeagueProvider');
  return ctx;
}

function withSlug(team) {
  return { ...team, slug: teamSlug(team.displayName) };
}

export function deriveSeason(snapshot, season) {
  if (!snapshot || !season) return null;
  const teams = (season.members || [])
    .map(m => withSlug(mergeTeam(snapshot.teams[m.teamId] || null, m)));
  return {
    snapshot,
    season,
    teamsById: snapshot.teams,
    teams: teams.filter(t => t.active),
    allTeams: teams,
  };
}

export function findSeason(snapshot, seasonId) {
  if (!snapshot) return null;
  if (!seasonId) return getActiveSeason({ seasons: snapshot.seasons, activeSeasonId: snapshot.activeSeasonId });
  return (snapshot.seasons || []).find(s => s.id === seasonId) || null;
}

export function useSeason(seasonId) {
  const { snapshot } = useLeague();
  return useMemo(() => deriveSeason(snapshot, findSeason(snapshot, seasonId)), [snapshot, seasonId]);
}

export function usePlayerSlugs() {
  const ctx = useContext(LeagueCtx);
  return ctx ? ctx.playerSlugs : null;
}

export function usePageTitle(title) {
  useEffect(() => {
    if (!title) return undefined;
    const previous = document.title;
    document.title = `${title} · KPB`;
    return () => { document.title = previous; };
  }, [title]);
}
