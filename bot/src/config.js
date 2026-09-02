import 'dotenv/config';

function req(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var ${name}`);
  return v.trim();
}
function opt(name, fallback = null) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function buildChannelMap() {
  const map = new Map();
  const named = {
    final_scores: opt('CHANNEL_FINAL_SCORES'),
    transactions: opt('CHANNEL_TRANSACTIONS'),
    suspensions: opt('CHANNEL_SUSPENSIONS'),
    game_times: opt('CHANNEL_GAME_TIMES'),
    awards: opt('CHANNEL_AWARDS'),
  };
  for (const [kind, id] of Object.entries(named)) {
    if (id) map.set(id, kind);
  }
  const extra = opt('EXTRA_CHANNELS_JSON');
  if (extra) {
    let parsed;
    try {
      parsed = JSON.parse(extra);
    } catch (e) {
      throw new Error('EXTRA_CHANNELS_JSON is not valid JSON');
    }
    for (const [id, kind] of Object.entries(parsed)) map.set(String(id), String(kind));
  }
  return map;
}

export const config = {
  discordToken: req('DISCORD_BOT_TOKEN'),
  guildId: opt('DISCORD_GUILD_ID'),
  adminUserId: req('ADMIN_USER_ID'),
  supabaseUrl: req('SUPABASE_URL'),
  supabaseServiceKey: req('SUPABASE_SERVICE_ROLE_KEY'),
  leagueId: req('LEAGUE_ID'),
  channels: buildChannelMap(),
  autoApply: opt('AUTO_APPLY', 'true') !== 'false',
  backfillLimit: Number(opt('BACKFILL_LIMIT', '500')) || 50,
  logLevel: opt('LOG_LEVEL', 'info'),
};

if (config.channels.size === 0) {
  throw new Error('No channels configured. Set at least one CHANNEL_* env var.');
}
