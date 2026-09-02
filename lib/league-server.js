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
  const { data, error } = await supabase.from('kv_store').select('value').eq('key', key).maybeSingle();
  if (error || !data) return null;
  try {
    return JSON.parse(data.value);
  } catch (e) {
    return null;
  }
}

export const getLeague = cache(async () => {
  const supabase = client();
  if (!supabase || !LEAGUE_ID) return null;
  return kvGet(supabase, `league:${LEAGUE_ID}`);
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
  const league = await getLeague();
  if (!league) return null;
  const season = getActiveSeason(league);
  if (!season) return { league, season: null, teamsById: {}, teams: [] };
  const teamsById = await getTeamsById((season.members || []).map(m => m.teamId));
  const teams = (season.members || [])
    .map(m => mergeTeam(teamsById[m.teamId] || null, m))
    .filter(t => t.active)
    .map(t => ({ ...t, slug: teamSlug(t.displayName) }));
  return { league, season, teamsById, teams };
});

export async function getTeamBySlug(slug) {
  const ctx = await getLeagueContext();
  if (!ctx || !ctx.season) return null;
  return ctx.teams.find(t => t.slug === slug) || null;
}
