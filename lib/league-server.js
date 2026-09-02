import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getActiveSeason, mergeTeam, teamSlug } from './domain/core.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID;

function client() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function kvGet(supabase, key) {
  const row = await kvGetRow(supabase, key);
  return row ? row.value : null;
}

async function kvGetRow(supabase, key) {
  const { data, error } = await supabase.from('kv_store').select('value, updated_at').eq('key', key).maybeSingle();
  if (error || !data) return null;
  try {
    return { value: JSON.parse(data.value), updatedAt: data.updated_at };
  } catch (e) {
    return null;
  }
}

export const getLeagueRow = cache(async () => {
  const supabase = client();
  if (!supabase || !LEAGUE_ID) return null;
  return kvGetRow(supabase, `league:${LEAGUE_ID}`);
});

export const getLeague = cache(async () => {
  const row = await getLeagueRow();
  return row ? row.value : null;
});

export const getTeamsById = cache(async (teamIds) => {
  const supabase = client();
  if (!supabase) return {};
  const ids = [...new Set(teamIds.filter(Boolean))];
  const rows = await Promise.all(ids.map(id => kvGet(supabase, `team:${id}`)));
  const byId = {};
  ids.forEach((id, i) => { if (rows[i]) byId[id] = rows[i]; });
  return byId;
});

export const getLeagueContext = cache(async () => {
  const row = await getLeagueRow();
  const league = row ? row.value : null;
  const updatedAt = row ? row.updatedAt : null;
  if (!league) return null;
  const season = getActiveSeason(league);
  if (!season) return { league, updatedAt, season: null, teamsById: {}, teams: [] };
  const teamsById = await getTeamsById((season.members || []).map(m => m.teamId));
  const teams = (season.members || [])
    .map(m => mergeTeam(teamsById[m.teamId] || null, m))
    .filter(t => t.active)
    .map(t => ({ ...t, slug: teamSlug(t.displayName) }));
  return { league, updatedAt, season, teamsById, teams };
});

export async function getTeamBySlug(slug) {
  const ctx = await getLeagueContext();
  if (!ctx || !ctx.season) return null;
  return ctx.teams.find(t => t.slug === slug) || null;
}
