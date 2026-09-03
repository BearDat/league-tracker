'use client';

import { supabase } from './supabaseClient';

const LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID;

export class LeagueConflict extends Error {
  constructor() {
    super('Someone else saved while you were editing.');
    this.name = 'LeagueConflict';
  }
}

export function leagueKey() {
  return `league:${LEAGUE_ID}`;
}

export async function readLeagueRow() {
  const { data, error } = await supabase
    .from('kv_store')
    .select('value, updated_at')
    .eq('key', leagueKey())
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${leagueKey()} is not in kv_store`);
  return { league: JSON.parse(data.value), updatedAt: data.updated_at };
}

async function compareAndSet(nextValue, expectedUpdatedAt) {
  const stamp = new Date().toISOString();
  let query = supabase.from('kv_store').update({ value: nextValue, updated_at: stamp }).eq('key', leagueKey());
  query = expectedUpdatedAt === null || expectedUpdatedAt === undefined
    ? query.is('updated_at', null)
    : query.eq('updated_at', expectedUpdatedAt);
  const { data, error } = await query.select('key');
  if (error) throw error;
  if (!data || data.length === 0) throw new LeagueConflict();
  return stamp;
}

export async function mutateLeague(mutator, { attempts = 5 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await readLeagueRow();
    const next = mutator(current.league);
    if (!next) return { changed: false, league: current.league, updatedAt: current.updatedAt };
    try {
      const updatedAt = await compareAndSet(JSON.stringify(next), current.updatedAt);
      return { changed: true, league: next, updatedAt };
    } catch (e) {
      if (!(e instanceof LeagueConflict)) throw e;
      await new Promise(r => setTimeout(r, 120 * (attempt + 1) + Math.random() * 120));
    }
  }
  throw new LeagueConflict();
}

export async function overwriteLeague(league) {
  const { error } = await supabase
    .from('kv_store')
    .update({ value: JSON.stringify(league), updated_at: new Date().toISOString() })
    .eq('key', leagueKey());
  if (error) throw error;
}
