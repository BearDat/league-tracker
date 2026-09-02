import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { log } from './logger.js';

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export class ConflictError extends Error {
  constructor() {
    super('kv_store row changed underneath this write');
    this.name = 'ConflictError';
  }
}

export async function kvRead(key) {
  const { data, error } = await supabase
    .from('kv_store')
    .select('value, updated_at')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { value: data.value, updatedAt: data.updated_at };
}

export async function kvReadJson(key) {
  const row = await kvRead(key);
  if (!row) return null;
  try {
    return { data: JSON.parse(row.value), updatedAt: row.updatedAt };
  } catch (e) {
    throw new Error(`kv_store row ${key} is not valid JSON`);
  }
}

async function kvCompareAndSet(key, nextValue, expectedUpdatedAt) {
  const stamp = new Date().toISOString();
  let query = supabase.from('kv_store').update({ value: nextValue, updated_at: stamp }).eq('key', key);
  query = expectedUpdatedAt === null || expectedUpdatedAt === undefined
    ? query.is('updated_at', null)
    : query.eq('updated_at', expectedUpdatedAt);
  const { data, error } = await query.select('key');
  if (error) throw error;
  if (!data || data.length === 0) throw new ConflictError();
  return stamp;
}

export async function mutateJson(key, mutator, { attempts = 5 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await kvReadJson(key);
    if (!current) throw new Error(`kv_store row ${key} does not exist`);
    const next = await mutator(current.data);
    if (next === null || next === undefined) return { changed: false, data: current.data };
    try {
      await kvCompareAndSet(key, JSON.stringify(next), current.updatedAt);
      return { changed: true, data: next };
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      const backoff = 120 * (attempt + 1) + Math.floor(Math.random() * 120);
      log.warn('kv write conflict, retrying', { key, attempt: attempt + 1, backoff });
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw new ConflictError();
}

export async function getLeagueRaw() {
  return kvReadJson(`league:${config.leagueId}`);
}

export async function mutateLeague(mutator) {
  return mutateJson(`league:${config.leagueId}`, mutator);
}

export async function getTeam(teamId) {
  const row = await kvReadJson(`team:${teamId}`);
  return row ? row.data : null;
}

export async function markProcessed(messageId, kind, outcome, detail) {
  const { error } = await supabase.from('bot_processed').upsert({
    message_id: messageId,
    kind,
    outcome,
    detail: detail ? String(detail).slice(0, 2000) : null,
    processed_at: new Date().toISOString(),
  });
  if (error) log.error('failed to record processed message', { messageId, error: error.message });
}

export async function isProcessed(messageId) {
  const { data, error } = await supabase
    .from('bot_processed')
    .select('message_id')
    .eq('message_id', messageId)
    .maybeSingle();
  if (error) {
    log.error('processed lookup failed', { messageId, error: error.message });
    return false;
  }
  return !!data;
}

export async function getCursor(channelId) {
  const { data, error } = await supabase
    .from('bot_channel_cursor')
    .select('last_message_id')
    .eq('channel_id', channelId)
    .maybeSingle();
  if (error) throw error;
  return data ? data.last_message_id : null;
}

export async function setCursor(channelId, lastMessageId) {
  const { error } = await supabase.from('bot_channel_cursor').upsert({
    channel_id: channelId,
    last_message_id: lastMessageId,
    updated_at: new Date().toISOString(),
  });
  if (error) log.error('cursor write failed', { channelId, error: error.message });
}
