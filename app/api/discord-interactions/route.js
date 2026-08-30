// Discord's HTTP Interactions endpoint for the league's slash-command bot.
// Discord POSTs every slash-command invocation here (no gateway/WebSocket
// connection needed, which is what lets this run as an ordinary serverless
// route instead of a separate always-on process) — this verifies the
// request really came from Discord, then answers /standings, /player,
// /compare, /leaders, and /nextgame from the same Supabase data the site
// itself reads.
import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import {
  getLeague, getActiveSeason, getTeamsById, teamDisplayName,
  computeSimpleStandings, getPlayerCareer, getAllPlayerNames, getSeasonLeaders, getNextGame,
} from '../../../lib/discordData';

export const runtime = 'nodejs';

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

function reply(content) {
  return Response.json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content } });
}
function replyEmbed(embed) {
  return Response.json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { embeds: [embed] } });
}
function autocompleteReply(choices) {
  return Response.json({ type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT, data: { choices } });
}
function optVal(options, name) {
  const o = (options || []).find(o => o.name === name);
  return o ? o.value : null;
}
const EMBED_COLOR = 0xf5c64b; // matches the site's GOLD accent

async function handlePlayer(name) {
  const league = await getLeague();
  if (!league) return reply('No league is configured for this bot yet.');
  const career = getPlayerCareer(league, name);
  if (!career) return reply(`Couldn't find a player matching "${name}".`);
  const fields = [];
  if (career.hasBatting) {
    const b = career.batting;
    fields.push({
      name: 'Batting', inline: false,
      value: `AVG **${b.avg.toFixed(3).replace(/^0/, '')}** · OBP ${b.obp.toFixed(3).replace(/^0/, '')} · SLG ${b.slg.toFixed(3).replace(/^0/, '')} · OPS ${b.ops.toFixed(3)}\n` +
        `${career.totals.h} H · ${career.totals.hr} HR · ${career.totals.rbi} RBI · ${career.totals.ab} AB`,
    });
  }
  if (career.hasPitching) {
    const p = career.pitching;
    fields.push({ name: 'Pitching', inline: false, value: `ERA **${p.era.toFixed(2)}** · WHIP ${p.whip.toFixed(2)} · ${p.ip.toFixed(1)} IP · ${p.k} K` });
  }
  if (fields.length === 0) fields.push({ name: 'Stats', value: 'No stats recorded yet.' });
  return replyEmbed({
    title: career.name, color: EMBED_COLOR,
    description: `${career.seasonCount} season${career.seasonCount === 1 ? '' : 's'} · ${career.teamCount} team${career.teamCount === 1 ? '' : 's'}`,
    fields,
  });
}

async function handleCompare(nameA, nameB) {
  const league = await getLeague();
  if (!league) return reply('No league is configured for this bot yet.');
  const a = getPlayerCareer(league, nameA), b = getPlayerCareer(league, nameB);
  if (!a || !b) return reply(`Couldn't find ${!a ? `"${nameA}"` : `"${nameB}"`}.`);
  const bothBat = a.hasBatting && b.hasBatting, bothPitch = a.hasPitching && b.hasPitching;
  const fields = [];
  if (bothBat) {
    fields.push({ name: a.name, inline: true, value: `AVG ${a.batting.avg.toFixed(3).replace(/^0/, '')}\nOPS ${a.batting.ops.toFixed(3)}\nHR ${a.totals.hr} · RBI ${a.totals.rbi}` });
    fields.push({ name: b.name, inline: true, value: `AVG ${b.batting.avg.toFixed(3).replace(/^0/, '')}\nOPS ${b.batting.ops.toFixed(3)}\nHR ${b.totals.hr} · RBI ${b.totals.rbi}` });
  } else if (bothPitch) {
    fields.push({ name: a.name, inline: true, value: `ERA ${a.pitching.era.toFixed(2)}\nWHIP ${a.pitching.whip.toFixed(2)}\nK ${a.totals.k}` });
    fields.push({ name: b.name, inline: true, value: `ERA ${b.pitching.era.toFixed(2)}\nWHIP ${b.pitching.whip.toFixed(2)}\nK ${b.totals.k}` });
  } else {
    fields.push({ name: a.name, inline: true, value: a.hasBatting ? `AVG ${a.batting.avg.toFixed(3).replace(/^0/, '')} · HR ${a.totals.hr}` : a.hasPitching ? `ERA ${a.pitching.era.toFixed(2)}` : 'No stats' });
    fields.push({ name: b.name, inline: true, value: b.hasBatting ? `AVG ${b.batting.avg.toFixed(3).replace(/^0/, '')} · HR ${b.totals.hr}` : b.hasPitching ? `ERA ${b.pitching.era.toFixed(2)}` : 'No stats' });
  }
  return replyEmbed({ title: `${a.name} vs ${b.name}`, color: EMBED_COLOR, fields });
}

async function handleStandings() {
  const league = await getLeague();
  if (!league) return reply('No league is configured for this bot yet.');
  const season = getActiveSeason(league);
  if (!season) return reply('This league has no active season yet.');
  const teamsById = await getTeamsById(season);
  const rows = computeSimpleStandings(season, teamsById);
  if (rows.length === 0) return reply(`**${season.name}** has no teams yet.`);
  const nameWidth = Math.min(20, Math.max(...rows.map(r => r.name.length)));
  const lines = rows.map((r, i) =>
    `${String(i + 1).padStart(2)}. ${r.name.slice(0, nameWidth).padEnd(nameWidth)}  ${String(r.w).padStart(2)}-${String(r.l).padEnd(2)}  ${r.pct.toFixed(3).replace(/^0/, '')}  ${r.gb === 0 ? '-' : r.gb.toFixed(1)}`
  );
  return replyEmbed({ title: `${season.name} Standings`, color: EMBED_COLOR, description: '```\n' + lines.join('\n') + '\n```' });
}

async function handleLeaders(category) {
  const league = await getLeague();
  if (!league) return reply('No league is configured for this bot yet.');
  const season = getActiveSeason(league);
  if (!season) return reply('This league has no active season yet.');
  const { label, fmt, ranked } = getSeasonLeaders(season, category || 'avg');
  if (ranked.length === 0) return reply(`No qualifying players yet for ${label}.`);
  const lines = ranked.map((p, i) => `${i + 1}. **${p.name}** — ${fmt(p.v)}`);
  return replyEmbed({ title: `${season.name} — ${label} Leaders`, color: EMBED_COLOR, description: lines.join('\n') });
}

async function handleNextGame() {
  const league = await getLeague();
  if (!league) return reply('No league is configured for this bot yet.');
  const season = getActiveSeason(league);
  if (!season) return reply('This league has no active season yet.');
  const teamsById = await getTeamsById(season);
  const g = getNextGame(season, teamsById);
  if (!g) return reply('No upcoming games on the schedule.');
  // Discord auto-renders <t:UNIX:F> in each viewer's own local time/format —
  // the same "no explicit timezone conversion needed" trick the site itself
  // uses via toLocaleString, just via Discord's own timestamp markup instead.
  const when = g.gameTimeUTC != null ? `<t:${Math.round(g.gameTimeUTC / 1000)}:F>` : (g.date || 'Date TBD');
  return replyEmbed({ title: `${g.awayName} @ ${g.homeName}`, color: EMBED_COLOR, description: when });
}

function handleHelp() {
  return reply(
    '**League bot commands**\n' +
    '`/standings` — current season standings\n' +
    '`/player name:<player>` — career stats for a player\n' +
    '`/compare player1:<player> player2:<player>` — side-by-side stat comparison\n' +
    '`/leaders category:<avg|hr|rbi|ops|era|k>` — this season\'s stat leaders\n' +
    '`/nextgame` — the next scheduled game'
  );
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');

  const isValid = PUBLIC_KEY && signature && timestamp && await verifyKey(rawBody, signature, timestamp, PUBLIC_KEY);
  if (!isValid) return new Response('Bad request signature', { status: 401 });

  const interaction = JSON.parse(rawBody);

  if (interaction.type === InteractionType.PING) {
    return Response.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
    const focused = (interaction.data.options || []).find(o => o.focused);
    const league = await getLeague();
    const names = league ? getAllPlayerNames(league, focused ? focused.value : '') : [];
    return autocompleteReply(names.map(n => ({ name: n, value: n })));
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;
    try {
      switch (name) {
        case 'standings': return await handleStandings();
        case 'player': return await handlePlayer(optVal(options, 'name'));
        case 'compare': return await handleCompare(optVal(options, 'player1'), optVal(options, 'player2'));
        case 'leaders': return await handleLeaders(optVal(options, 'category'));
        case 'nextgame': return await handleNextGame();
        case 'help': return handleHelp();
        default: return reply(`Unknown command: /${name}`);
      }
    } catch (e) {
      return reply('Something went wrong looking that up — try again in a moment.');
    }
  }

  return new Response('Unhandled interaction type', { status: 400 });
}
