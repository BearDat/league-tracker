import { EmbedBuilder } from 'discord.js';
import { getLeagueRaw, getTeam } from '../store.js';
import { getActiveSeason, teamDisplayName, gameWinner } from '../league/core.js';
import { computeStandings } from '../league/standings.js';
import { seasonPlayers, playerCareer, allPlayerNames, outsToIpDisplay } from '../league/stats.js';

const COLOR = 0xf5c64b;

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const avg3 = (v) => v.toFixed(3).replace(/^0/, '');

async function teamsFor(season) {
  const ids = [...new Set((season.members || []).map(m => m.teamId).filter(Boolean))];
  const rows = await Promise.all(ids.map(id => getTeam(id)));
  const byId = {};
  ids.forEach((id, i) => { if (rows[i]) byId[id] = rows[i]; });
  return byId;
}

async function loadContext() {
  const raw = await getLeagueRaw();
  if (!raw) return null;
  const league = raw.data;
  const season = getActiveSeason(league);
  if (!season) return { league, season: null, teamsById: {} };
  return { league, season, teamsById: await teamsFor(season) };
}

function embed(title, description, fields) {
  const e = new EmbedBuilder().setColor(COLOR).setTitle(title);
  if (description) e.setDescription(description);
  if (fields && fields.length > 0) e.addFields(fields);
  return e;
}

function truncate(text, max = 4000) {
  const s = String(text == null ? '' : text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

async function handleStandings() {
  const ctx = await loadContext();
  if (!ctx) return 'No league is configured for this bot yet.';
  if (!ctx.season) return 'This league has no active season yet.';
  const rows = computeStandings(ctx.season, ctx.teamsById);
  if (rows.length === 0) return 'No teams in the active season yet.';
  const width = Math.max(...rows.map(r => r.name.length));
  const lines = rows.map(r => `${String(r.rank).padStart(2)}. ${r.name.padEnd(width)}  ${String(r.w).padStart(2)}-${String(r.l).padEnd(2)}  ${avg3(r.pct)}  ${r.gb === 0 ? '  —' : r.gb.toFixed(1).padStart(3)}`);
  return embed(`${ctx.season.name} standings`, `\`\`\`\n${truncate(lines.join('\n'), 3900)}\n\`\`\``);
}

async function handlePlayer(name) {
  const ctx = await loadContext();
  if (!ctx) return 'No league is configured for this bot yet.';
  const career = playerCareer(ctx.league, name);
  if (!career) return `Couldn't find a player matching "${name}".`;
  const fields = [];
  if (career.totals.ab > 0) {
    const b = career.batting;
    fields.push({
      name: 'Batting',
      value: `AVG **${avg3(b.avg)}** · OBP ${avg3(b.obp)} · SLG ${avg3(b.slg)} · OPS ${b.ops.toFixed(3)}\n`
        + `${career.totals.h} H · ${career.totals.hr} HR · ${career.totals.rbi} RBI · ${career.totals.ab} AB`,
    });
  }
  if (career.totals.outs > 0) {
    const p = career.pitching;
    fields.push({
      name: 'Pitching',
      value: `ERA **${p.era.toFixed(2)}** · WHIP ${p.whip.toFixed(2)} · ${outsToIpDisplay(career.totals.outs)} IP · ${p.k} K`,
    });
  }
  if (fields.length === 0) fields.push({ name: 'Stats', value: 'No stats recorded yet.' });
  const team = career.currentTeamId && ctx.season
    ? teamDisplayName(career.currentTeamId, ctx.season, ctx.teamsById)
    : null;
  return embed(career.name, `${career.seasons.length} season${career.seasons.length === 1 ? '' : 's'}${team ? ` · ${team}` : ''}`, fields);
}

async function handleCompare(nameA, nameB) {
  const ctx = await loadContext();
  if (!ctx) return 'No league is configured for this bot yet.';
  const a = playerCareer(ctx.league, nameA);
  const b = playerCareer(ctx.league, nameB);
  if (!a) return `Couldn't find a player matching "${nameA}".`;
  if (!b) return `Couldn't find a player matching "${nameB}".`;
  const line = (p) => `AVG ${avg3(p.batting.avg)} · OPS ${p.batting.ops.toFixed(3)} · ${p.totals.hr} HR · ${p.totals.rbi} RBI`
    + (p.totals.outs > 0 ? `\nERA ${p.pitching.era.toFixed(2)} · ${p.totals.k} K · ${outsToIpDisplay(p.totals.outs)} IP` : '');
  return embed(`${a.name} vs ${b.name}`, null, [
    { name: a.name, value: line(a), inline: true },
    { name: b.name, value: line(b), inline: true },
  ]);
}

const CATEGORIES = {
  avg: { label: 'Batting Average', of: p => p.batting.avg, fmt: avg3, min: t => t.ab >= 20 },
  ops: { label: 'OPS', of: p => p.batting.ops, fmt: v => v.toFixed(3), min: t => t.ab >= 20 },
  hr: { label: 'Home Runs', of: p => p.totals.hr, fmt: String, min: t => t.ab > 0 },
  rbi: { label: 'RBI', of: p => p.totals.rbi, fmt: String, min: t => t.ab > 0 },
  era: { label: 'ERA', of: p => p.pitching.era, fmt: v => v.toFixed(2), min: t => t.outs >= 30, asc: true },
  k: { label: 'Strikeouts', of: p => p.totals.k, fmt: String, min: t => t.outs > 0 },
};

async function handleLeaders(category) {
  const ctx = await loadContext();
  if (!ctx) return 'No league is configured for this bot yet.';
  if (!ctx.season) return 'This league has no active season yet.';
  const cat = CATEGORIES[category || 'avg'] || CATEGORIES.avg;
  const players = seasonPlayers(ctx.season).filter(p => cat.min(p.totals));
  if (players.length === 0) return `No qualifying players yet for ${cat.label} in ${ctx.season.name}.`;
  const ranked = players
    .map(p => ({ p, v: cat.of(p) }))
    .sort((x, y) => (cat.asc ? x.v - y.v : y.v - x.v))
    .slice(0, 10);
  const lines = ranked.map((r, i) => `${i + 1}. **${r.p.name}** — ${cat.fmt(r.v)}`);
  return embed(`${ctx.season.name} — ${cat.label} leaders`, lines.join('\n'));
}

async function handleNextGame() {
  const ctx = await loadContext();
  if (!ctx) return 'No league is configured for this bot yet.';
  if (!ctx.season) return 'This league has no active season yet.';
  const pending = (ctx.season.games || []).filter(g => !g.played && !g.isBye);
  if (pending.length === 0) return 'No upcoming games on the schedule.';
  const timed = pending.filter(g => g.gameTimeUTC != null).sort((a, b) => a.gameTimeUTC - b.gameTimeUTC);
  const g = timed[0] || pending[0];
  const away = teamDisplayName(g.awayTeamId, ctx.season, ctx.teamsById);
  const home = teamDisplayName(g.homeTeamId, ctx.season, ctx.teamsById);
  const when = g.gameTimeUTC != null ? `<t:${Math.round(g.gameTimeUTC / 1000)}:F>` : (g.date || 'Date TBD');
  return embed(`${away} @ ${home}`, when);
}

async function handleTeam(name) {
  const ctx = await loadContext();
  if (!ctx) return 'No league is configured for this bot yet.';
  if (!ctx.season) return 'This league has no active season yet.';
  const rows = computeStandings(ctx.season, ctx.teamsById);
  const target = norm(name);
  const row = rows.find(r => norm(r.name) === target) || rows.find(r => norm(r.name).includes(target));
  if (!row) return `Couldn't find a team matching "${name}".`;
  const member = (ctx.season.members || []).find(m => m.teamId === row.id);
  const roster = ((member && member.roster) || [])
    .slice()
    .sort((a, b) => (b.starLevel || 0) - (a.starLevel || 0) || String(a.name).localeCompare(String(b.name)))
    .map(p => `${p.name}${typeof p.starLevel === 'number' ? ` (${p.starLevel})` : ''}${p.suspended ? ' — suspended' : ''}${p.banned ? ' — banned' : ''}`);
  return embed(row.name, `**${row.w}-${row.l}** · ${avg3(row.pct)} · ${row.rank} of ${rows.length} · run diff ${row.diff > 0 ? '+' : ''}${row.diff} · streak ${row.streak}`, [
    { name: `Roster (${roster.length})`, value: truncate(roster.join('\n') || 'No players.', 1024) },
  ]);
}

async function handleAwards(seasonQuery) {
  const ctx = await loadContext();
  if (!ctx) return 'No league is configured for this bot yet.';
  const seasons = ctx.league.seasons || [];
  const defs = ctx.league.awardDefs || [];
  let season;
  if (seasonQuery) {
    const q = norm(seasonQuery);
    season = seasons.find(s => norm(s.name) === q)
      || seasons.find(s => norm(s.name) === `season${q}`)
      || seasons.find(s => norm(s.name).includes(q));
    if (!season) return `Couldn't find a season matching "${seasonQuery}".`;
  } else {
    season = [...seasons].reverse().find(s => Object.keys(s.awardWinners || {}).length > 0) || getActiveSeason(ctx.league);
  }
  if (!season) return 'This league has no seasons yet.';

  const winners = season.awardWinners || {};
  const keys = Object.keys(winners);
  if (keys.length === 0) return `No awards have been recorded for ${season.name} yet.`;

  const teamsById = await teamsFor(season);
  const rosterById = new Map();
  (season.members || []).forEach(m => (m.roster || []).forEach(p => rosterById.set(p.id, { name: p.name, teamId: m.teamId })));
  (season.freeAgents || []).forEach(p => rosterById.set(p.id, { name: p.name, teamId: null }));

  const order = new Map(defs.map((d, i) => [d.id, i]));
  const fields = keys
    .sort((a, b) => (order.has(a) ? order.get(a) : 999) - (order.has(b) ? order.get(b) : 999))
    .map(awardId => {
      const def = defs.find(d => d.id === awardId);
      const list = Array.isArray(winners[awardId]) ? winners[awardId] : [winners[awardId]];
      const names = list.map(w => {
        const hit = w.playerId ? rosterById.get(w.playerId) : null;
        const label = hit ? hit.name : (w.name || 'Unknown');
        const teamId = hit ? hit.teamId : w.teamId;
        const team = teamId ? teamDisplayName(teamId, season, teamsById) : null;
        return team ? `${label} (${team})` : label;
      });
      return { name: def ? def.name : 'Retired award', value: truncate(names.join('\n') || '—', 1024) };
    });

  return embed(`${season.name} awards`, null, fields.slice(0, 25));
}

async function handleTransactions() {
  const ctx = await loadContext();
  if (!ctx) return 'No league is configured for this bot yet.';
  if (!ctx.season) return 'This league has no active season yet.';
  const log = [...(ctx.season.activityLog || [])].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 15);
  if (log.length === 0) return `No roster moves recorded for ${ctx.season.name} yet.`;
  const lines = log.map(e => `<t:${Math.round((e.at || Date.now()) / 1000)}:d> — ${e.text}`);
  return embed(`${ctx.season.name} transactions`, truncate(lines.join('\n'), 3900));
}

async function handleNews() {
  const ctx = await loadContext();
  if (!ctx) return 'No league is configured for this bot yet.';
  const posts = [...(ctx.league.news || [])].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 5);
  if (posts.length === 0) return 'Nothing has been posted yet.';
  return embed('League news', null, posts.map(p => ({
    name: truncate(p.title || 'Untitled', 250),
    value: truncate(`${p.author ? `${p.author} · ` : ''}<t:${Math.round((p.at || Date.now()) / 1000)}:d>\n${p.body || ''}`, 1024),
  })));
}

function handleHelp() {
  return embed('League bot commands', [
    '`/standings` — current season standings',
    '`/player name:<player>` — career stats for a player',
    '`/compare player1:<a> player2:<b>` — side-by-side comparison',
    '`/leaders category:<avg|hr|rbi|ops|era|k>` — this season\'s leaders',
    '`/team name:<team>` — record and roster',
    '`/awards season:<season>` — award winners for a season',
    '`/transactions` — the most recent roster moves',
    '`/news` — the latest league news',
    '`/nextgame` — the next scheduled game',
  ].join('\n'));
}

export async function runCommand(name, get) {
  switch (name) {
    case 'standings': return handleStandings();
    case 'player': return handlePlayer(get('name'));
    case 'compare': return handleCompare(get('player1'), get('player2'));
    case 'leaders': return handleLeaders(get('category'));
    case 'nextgame': return handleNextGame();
    case 'team': return handleTeam(get('name'));
    case 'awards': return handleAwards(get('season'));
    case 'transactions': return handleTransactions();
    case 'news': return handleNews();
    case 'help': return handleHelp();
    default: return `Unknown command: /${name}`;
  }
}

export async function autocompleteChoices(commandName, focusedName, value) {
  const raw = await getLeagueRaw();
  if (!raw) return [];
  const league = raw.data;
  if (commandName === 'awards' && focusedName === 'season') {
    const q = norm(value);
    return (league.seasons || [])
      .map(s => s.name)
      .filter(n => !q || norm(n).includes(q))
      .slice(0, 25)
      .map(n => ({ name: n, value: n }));
  }
  if (commandName === 'team') {
    const season = getActiveSeason(league);
    if (!season) return [];
    const teamsById = await teamsFor(season);
    const q = norm(value);
    return (season.members || [])
      .filter(m => m.active !== false)
      .map(m => teamDisplayName(m.teamId, season, teamsById))
      .filter(n => !q || norm(n).includes(q))
      .slice(0, 25)
      .map(n => ({ name: n, value: n }));
  }
  return allPlayerNames(league, value).map(n => ({ name: n, value: n }));
}

export { gameWinner };
