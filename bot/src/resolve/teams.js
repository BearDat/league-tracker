import { supabase, getTeam } from '../store.js';
import { normalizeName } from '../parsers/util.js';
import { log } from '../logger.js';

export async function loadTeamDirectory(season) {
  const ids = [...new Set((season.members || []).map(m => m.teamId).filter(Boolean))];
  const teams = await Promise.all(ids.map(id => getTeam(id)));
  const directory = [];
  ids.forEach((id, i) => {
    const member = (season.members || []).find(m => m.teamId === id);
    const rebrand = member && member.rebrand;
    const name = (rebrand && rebrand.name) || (teams[i] && teams[i].name) || (member && member.scheduleName) || null;
    if (!name) return;
    const words = name.trim().split(/\s+/);
    directory.push({
      teamId: id,
      name,
      normalized: normalizeName(name),
      nickname: normalizeName(words[words.length - 1]),
    });
  });
  return directory;
}

export async function loadEmojiAliases() {
  const { data, error } = await supabase.from('bot_team_emoji').select('emoji_id, emoji_name, team_id');
  if (error) {
    log.error('emoji alias load failed', { error: error.message });
    return new Map();
  }
  return new Map((data || []).map(row => [row.emoji_id, row]));
}

export async function learnEmojiAlias(emojiId, emojiName, teamId, source) {
  const { error } = await supabase.from('bot_team_emoji').upsert({
    emoji_id: emojiId,
    emoji_name: emojiName,
    team_id: teamId,
    source: source || 'auto',
  });
  if (error) log.error('emoji alias write failed', { emojiId, error: error.message });
}

export function resolveEmoji(emojiId, emojiName, directory, aliases) {
  const alias = aliases.get(emojiId);
  if (alias) {
    const known = directory.find(t => t.teamId === alias.team_id);
    if (known) {
      return { teamId: known.teamId, name: known.name, confidence: 'high', via: 'alias', candidates: [] };
    }
    return {
      teamId: null,
      name: null,
      confidence: 'none',
      via: 'alias-stale',
      reason: `emoji is mapped to team ${alias.team_id}, which is not in the active season`,
      candidates: directory,
    };
  }

  const normalized = normalizeName(emojiName);
  const exact = directory.filter(t => t.normalized === normalized);
  if (exact.length === 1) {
    return { teamId: exact[0].teamId, name: exact[0].name, confidence: 'high', via: 'name', candidates: [] };
  }

  const nicknameHits = directory.filter(t => t.nickname && normalized.includes(t.nickname));
  if (nicknameHits.length === 1) {
    return {
      teamId: nicknameHits[0].teamId,
      name: nicknameHits[0].name,
      confidence: 'medium',
      via: 'nickname',
      reason: `emoji :${emojiName}: is not mapped yet — matched on "${nicknameHits[0].name}" by nickname`,
      candidates: nicknameHits,
    };
  }
  if (nicknameHits.length > 1) {
    return {
      teamId: null,
      name: null,
      confidence: 'none',
      via: 'ambiguous',
      reason: `emoji :${emojiName}: matches ${nicknameHits.length} teams`,
      candidates: nicknameHits,
    };
  }

  return {
    teamId: null,
    name: null,
    confidence: 'none',
    via: 'unknown',
    reason: `emoji :${emojiName}: is not mapped to any team`,
    candidates: directory,
  };
}

export async function resolveWithLearning(emojiId, emojiName, directory, aliases, learn = true) {
  const result = resolveEmoji(emojiId, emojiName, directory, aliases);
  if (learn && result.confidence === 'high' && result.via === 'name') {
    await learnEmojiAlias(emojiId, emojiName, result.teamId, 'auto-name');
    aliases.set(emojiId, { emoji_id: emojiId, emoji_name: emojiName, team_id: result.teamId });
  }
  return result;
}
