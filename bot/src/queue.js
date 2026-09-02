import { supabase } from './store.js';
import { log } from './logger.js';

export async function createPending(record) {
  const { data, error } = await supabase
    .from('bot_pending')
    .upsert({
      kind: record.kind,
      status: 'pending',
      channel_id: record.channelId,
      message_id: record.messageId,
      guild_id: record.guildId || null,
      author_tag: record.authorTag || null,
      raw_text: record.rawText.slice(0, 4000),
      parsed: record.parsed || {},
      reasons: record.reasons || [],
    }, { onConflict: 'message_id,kind' })
    .select('id')
    .single();
  if (error) {
    log.error('pending insert failed', { error: error.message });
    return null;
  }
  return data.id;
}

export async function attachDmMessage(pendingId, dmMessageId) {
  const { error } = await supabase.from('bot_pending').update({ dm_message_id: dmMessageId }).eq('id', pendingId);
  if (error) log.error('pending dm link failed', { pendingId, error: error.message });
}

export async function getPending(pendingId) {
  const { data, error } = await supabase.from('bot_pending').select('*').eq('id', pendingId).maybeSingle();
  if (error) {
    log.error('pending lookup failed', { pendingId, error: error.message });
    return null;
  }
  return data;
}

export async function closePending(pendingId, status, resolvedBy, errorText) {
  const { error } = await supabase
    .from('bot_pending')
    .update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy || null,
      error: errorText ? String(errorText).slice(0, 2000) : null,
    })
    .eq('id', pendingId);
  if (error) log.error('pending close failed', { pendingId, error: error.message });
}

export async function listPending(limit = 25) {
  const { data, error } = await supabase
    .from('bot_pending')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    log.error('pending list failed', { error: error.message });
    return [];
  }
  return data || [];
}
