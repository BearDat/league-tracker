'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { readLeagueRow, mutateLeague, overwriteLeague, LeagueConflict } from './leagueWrite';
import { useLeague } from './LeagueContext';
import { getActiveSeason } from './domain/core';
import { computeStandings } from './domain/standings';

const AdminCtx = createContext(null);

export function AdminLeagueProvider({ children }) {
  const { refresh } = useLeague();
  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await readLeagueRow();
      setLeague(row.league);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const mutate = useCallback(async (mutator) => {
    setSaving(true);
    setError(null);
    setConflict(null);
    try {
      const result = await mutateLeague(mutator);
      setLeague(result.league);
      setSavedAt(Date.now());
      await refresh({ fresh: true });
      return { ok: true };
    } catch (e) {
      if (e instanceof LeagueConflict) {
        setConflict({ mutator });
        return { ok: false, conflict: true };
      }
      setError(e.message);
      return { ok: false, error: e.message };
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  const forceConflict = useCallback(async () => {
    if (!conflict || !league) return;
    setSaving(true);
    try {
      const next = conflict.mutator(league);
      if (next) {
        await overwriteLeague(next);
        setLeague(next);
        setSavedAt(Date.now());
        await refresh({ fresh: true });
      }
      setConflict(null);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }, [conflict, league, refresh]);

  const dismissConflict = useCallback(async () => {
    setConflict(null);
    await load();
  }, [load]);

  const season = league ? getActiveSeason(league) : null;

  const seedById = useMemo(() => {
    if (!season) return {};
    const teamsById = {};
    const standings = computeStandings(season, teamsById).active;
    const map = {};
    standings.forEach((t, i) => { map[t.id] = i + 1; });
    return map;
  }, [season]);

  const value = useMemo(() => ({
    league, season, seedById, loading, error, saving, conflict, savedAt,
    mutate, reload: load, forceConflict, dismissConflict, setError,
  }), [league, season, seedById, loading, error, saving, conflict, savedAt, mutate, load, forceConflict, dismissConflict]);

  return <AdminCtx.Provider value={value}>{children}</AdminCtx.Provider>;
}

export function useAdminLeague() {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error('useAdminLeague must be used inside an AdminLeagueProvider');
  return ctx;
}
