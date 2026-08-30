#!/usr/bin/env node
// One-time (or re-run-when-commands-change) script that registers the bot's
// slash commands with Discord. Not part of the Next.js app itself — run by
// hand with `node scripts/register-discord-commands.js` after setting
// DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID (see README's Discord bot setup
// section for where to find these).
//
// Registers them as GLOBAL commands (available in every server the bot is
// in) since these are read-only lookup commands, not admin-only — global
// commands can take up to an hour to show up everywhere the first time;
// pass a server id as the first CLI argument to register them as GUILD
// commands instead, which show up instantly (handy while testing):
//   node scripts/register-discord-commands.js 123456789012345678

const fs = require('fs');
const path = require('path');

// Next.js auto-loads .env.local for the app itself; this plain script
// doesn't get that for free, so read it directly if present.
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
}
loadEnvLocal();

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.argv[2] || null;

if (!token || !clientId) {
  console.error('Missing DISCORD_BOT_TOKEN and/or DISCORD_CLIENT_ID — set them in .env.local first.');
  process.exit(1);
}

const commands = [
  {
    name: 'standings',
    description: 'Show the current season standings',
    type: 1,
  },
  {
    name: 'player',
    description: 'Look up a player\'s career stats',
    type: 1,
    options: [
      { name: 'name', description: 'Player name', type: 3, required: true, autocomplete: true },
    ],
  },
  {
    name: 'compare',
    description: 'Compare two players\' stats side by side',
    type: 1,
    options: [
      { name: 'player1', description: 'First player', type: 3, required: true, autocomplete: true },
      { name: 'player2', description: 'Second player', type: 3, required: true, autocomplete: true },
    ],
  },
  {
    name: 'leaders',
    description: 'Show this season\'s stat leaders',
    type: 1,
    options: [
      {
        name: 'category', description: 'Stat category', type: 3, required: false,
        choices: [
          { name: 'Batting Average', value: 'avg' },
          { name: 'Home Runs', value: 'hr' },
          { name: 'RBI', value: 'rbi' },
          { name: 'OPS', value: 'ops' },
          { name: 'ERA', value: 'era' },
          { name: 'Strikeouts', value: 'k' },
        ],
      },
    ],
  },
  {
    name: 'nextgame',
    description: 'Show the next scheduled game',
    type: 1,
  },
  {
    name: 'help',
    description: 'List everything this bot can do',
    type: 1,
  },
];

async function main() {
  const url = guildId
    ? `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${clientId}/commands`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    console.error(`Discord API returned ${res.status}:`, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  console.log(`Registered ${data.length} command(s) ${guildId ? `to guild ${guildId} (instant)` : 'globally (may take up to an hour to appear everywhere)'}:`);
  data.forEach(c => console.log(`  /${c.name}`));
}

main().catch(e => { console.error(e); process.exit(1); });
