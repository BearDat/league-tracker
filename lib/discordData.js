// Server-side data + stat helpers for the Discord bot's slash commands.
// Deliberately independent from components/LeagueTracker.jsx (a 'use client'
// file full of React/browser-only code) rather than importing from it — this
// reimplements just the subset of the site's stat math the bot needs, kept
// intentionally simpler than the site's own Standings/Leaders views (no
// strength-of-schedule, no advanced tiebreakers) since a chat reply has to
// stay short anyway.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID;

// A fresh client per import is fine here — this module only ever runs in a
// short-lived serverless function invocation, not a long-running process.
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

async function kvGet(key) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('kv_store').select('value').eq('key', key).maybeSingle();
  if (error || !data) return null;
  try { return JSON.parse(data.value); } catch (e) { return null; }
}

export async function getLeague() {
  if (!LEAGUE_ID) return null;
  return kvGet(`league:${LEAGUE_ID}`);
}

export function getActiveSeason(league) {
  if (!league || !league.seasons || league.seasons.length === 0) return null;
  return league.seasons.find(s => s.id === league.activeSeasonId) || league.seasons[league.seasons.length - 1];
}

export async function getTeamsById(season) {
  const ids = [...new Set((season?.members || []).map(m => m.teamId).filter(Boolean))];
  const teams = await Promise.all(ids.map(id => kvGet(`team:${id}`)));
  const byId = {};
  ids.forEach((id, i) => { if (teams[i]) byId[id] = teams[i]; });
  return byId;
}

export function teamDisplayName(teamId, season, teamsById) {
  const member = (season?.members || []).find(m => m.teamId === teamId);
  const t = teamsById[teamId];
  const rb = member && member.rebrand;
  return (rb && rb.name) || (t && t.name) || (member && member.scheduleName) || 'Unknown team';
}

function gameWinner(g) {
  if (g.winnerOverride === 'home' || g.winnerOverride === 'away') return g.winnerOverride;
  const hs = Number(g.homeScore), as = Number(g.awayScore);
  if (Number.isNaN(hs) || Number.isNaN(as)) return null;
  if (hs > as) return 'home';
  if (as > hs) return 'away';
  return null;
}

// Simplified standings: W-L-PCT-GB only, sorted by win %. The site's own
// Standings tab additionally weighs strength of schedule/victory and several
// tiebreakers — out of scope for a one-line-per-team chat reply.
export function computeSimpleStandings(season, teamsById) {
  const map = {};
  (season.members || []).forEach(m => {
    map[m.teamId] = { teamId: m.teamId, w: Number(m.baselineW) || 0, l: Number(m.baselineL) || 0 };
  });
  (season.games || []).forEach(g => {
    if (!g.played || g.isPlayoff || g.isSpringTraining) return;
    const home = map[g.homeTeamId], away = map[g.awayTeamId];
    if (!home || !away) return;
    const winner = gameWinner(g);
    if (winner === 'home') { home.w += 1; away.l += 1; }
    else if (winner === 'away') { away.w += 1; home.l += 1; }
  });
  const rows = Object.values(map).map(t => {
    const gp = t.w + t.l;
    return { ...t, name: teamDisplayName(t.teamId, season, teamsById), gp, pct: gp > 0 ? t.w / gp : 0 };
  }).sort((a, b) => b.pct - a.pct || b.w - a.w);
  const leadW = rows[0] ? rows[0].w : 0, leadL = rows[0] ? rows[0].l : 0;
  return rows.map(t => ({ ...t, gb: ((leadW - t.w) + (t.l - leadL)) / 2 }));
}

function ipDisplayToOuts(ip) {
  const n = Number(ip) || 0;
  const whole = Math.trunc(n);
  const frac = Math.round((n - whole) * 10);
  return whole * 3 + Math.min(2, Math.max(0, frac));
}

function normalizeStatRow(row) {
  return {
    ab: Number(row.ab) || 0, r: Number(row.r) || 0, h: Number(row.h) || 0, rbi: Number(row.rbi) || 0,
    bb: Number(row.bb) || 0, so: Number(row.so) || 0, ip: Number(row.ip) || 0, ha: Number(row.ha) || 0,
    er: Number(row.er) || 0, bbAllowed: Number(row.bbAllowed) || 0, k: Number(row.k) || 0,
    hrAllowed: Number(row.hrAllowed) || 0, e: Number(row.e) || 0, hr: Number(row.hr) || 0,
    doubles: Number(row.doubles) || 0, triples: Number(row.triples) || 0,
    g: row.g != null ? Number(row.g) || 0 : undefined,
  };
}

function sumTotals(rows) {
  const t = { g: 0, ab: 0, r: 0, h: 0, rbi: 0, bb: 0, so: 0, outs: 0, ha: 0, er: 0, bbAllowed: 0, k: 0, hrAllowed: 0, e: 0, hr: 0, doubles: 0, triples: 0 };
  rows.forEach(row => {
    t.g += row.g != null ? row.g : 1;
    t.ab += row.ab; t.r += row.r; t.h += row.h; t.rbi += row.rbi; t.bb += row.bb; t.so += row.so;
    t.outs += ipDisplayToOuts(row.ip); t.ha += row.ha; t.er += row.er; t.bbAllowed += row.bbAllowed;
    t.k += row.k; t.hrAllowed += row.hrAllowed; t.e += row.e; t.hr += row.hr;
    t.doubles += row.doubles; t.triples += row.triples;
  });
  return t;
}

function playerSingles(t) { return Math.max(0, t.h - t.hr - t.doubles - t.triples); }

export function battingLine(t) {
  const avg = t.ab > 0 ? t.h / t.ab : 0;
  const obpDenom = t.ab + t.bb;
  const obp = obpDenom > 0 ? (t.h + t.bb) / obpDenom : 0;
  const totalBases = playerSingles(t) * 1 + t.doubles * 2 + t.triples * 3 + t.hr * 4;
  const slg = t.ab > 0 ? totalBases / t.ab : 0;
  return { avg, obp, slg, ops: obp + slg };
}

export function pitchingLine(t) {
  const era = t.outs > 0 ? (t.er * 27) / t.outs : 0;
  const whip = t.outs > 0 ? ((t.ha + t.bbAllowed) * 3) / t.outs : 0;
  return { ip: t.outs / 3, era, whip, k: t.k };
}

const norm = (s) => (s || '').trim().toLowerCase();

// Same closure-match idea as the site's getPlayerCareerData: starting from a
// name, pull in every roster/free-agent entry anywhere in the league that
// shares a Roblox account id or an overlapping name/usernameHistory with an
// already-matched entry, so a past rename doesn't split one player's career
// into two lookups.
function collectCareerEntries(league, queryName) {
  const allEntries = [];
  (league.seasons || []).forEach(season => {
    (season.members || []).forEach(member => {
      (member.roster || []).forEach(p => allEntries.push({ season, teamId: member.teamId, playerId: p.id, player: p }));
    });
    (season.freeAgents || []).forEach(p => allEntries.push({ season, teamId: null, playerId: p.id, player: p }));
  });
  const namesOf = (p) => [norm(p.name), ...((p.usernameHistory || []).map(norm))];
  const knownNames = new Set([norm(queryName)]);
  const knownIds = new Set();
  const matched = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    allEntries.forEach((entry, i) => {
      if (matched.has(i)) return;
      const rid = entry.player.robloxUserId ? String(entry.player.robloxUserId) : null;
      const names = namesOf(entry.player);
      if ((rid && knownIds.has(rid)) || names.some(n => knownNames.has(n))) {
        matched.add(i); changed = true;
        if (rid) knownIds.add(rid);
        names.forEach(n => knownNames.add(n));
      }
    });
  }
  return allEntries.filter((_, i) => matched.has(i));
}

// Finds a player by exact name match first, falling back to a substring
// match — good enough for a chat command where the user might not type the
// exact casing/spelling used on the roster.
function findPlayerName(league, query) {
  const q = norm(query);
  const allNames = new Set();
  (league.seasons || []).forEach(season => {
    (season.members || []).forEach(m => (m.roster || []).forEach(p => allNames.add(p.name)));
    (season.freeAgents || []).forEach(p => allNames.add(p.name));
  });
  const names = [...allNames];
  const exact = names.find(n => norm(n) === q);
  if (exact) return exact;
  return names.find(n => norm(n).includes(q)) || null;
}

export function getAllPlayerNames(league, query, limit = 25) {
  const allNames = new Set();
  (league.seasons || []).forEach(season => {
    (season.members || []).forEach(m => (m.roster || []).forEach(p => allNames.add(p.name)));
    (season.freeAgents || []).forEach(p => allNames.add(p.name));
  });
  const q = norm(query || '');
  return [...allNames].filter(n => norm(n).includes(q)).slice(0, limit);
}

// Builds one player's career stat line by summing every game (+ imported
// season totals) recorded under any entry collectCareerEntries found for
// them, across every season in the league.
export function getPlayerCareer(league, query) {
  const resolvedName = findPlayerName(league, query);
  if (!resolvedName) return null;
  const entries = collectCareerEntries(league, resolvedName);
  if (entries.length === 0) return null;
  const rows = [];
  const teamsPlayed = new Set();
  entries.forEach(info => {
    (info.season.games || []).forEach(g => {
      if (g.isBye || g.isSpringTraining) return;
      ['home', 'away'].forEach(side => {
        const statRows = (g.playerStats && g.playerStats[side]) || [];
        const row = statRows.find(r => r.playerId === info.playerId);
        if (row) { rows.push(normalizeStatRow(row)); teamsPlayed.add(side === 'home' ? g.homeTeamId : g.awayTeamId); }
      });
    });
    (info.season.importedStatLines || []).filter(r => r.playerId === info.playerId).forEach(row => rows.push(normalizeStatRow(row)));
    if (info.teamId) teamsPlayed.add(info.teamId);
  });
  const totals = sumTotals(rows);
  const latest = entries[entries.length - 1];
  return {
    name: latest.player.name,
    teamCount: teamsPlayed.size,
    seasonCount: new Set(entries.map(e => e.season.id)).size,
    totals,
    batting: battingLine(totals),
    pitching: pitchingLine(totals),
    hasBatting: totals.ab > 0,
    hasPitching: totals.outs > 0,
  };
}

// Season stat leaders for one category, built from just the active season's
// rosters (not full career) — matches what a "who's leading right now"
// question usually means.
export function getSeasonLeaders(season, category, limit = 5) {
  const players = [];
  (season.members || []).forEach(m => (m.roster || []).forEach(p => players.push({ name: p.name, teamId: m.teamId, playerId: p.id })));
  (season.freeAgents || []).forEach(p => players.push({ name: p.name, teamId: null, playerId: p.id }));

  const rowsByPlayer = {};
  (season.games || []).forEach(g => {
    if (g.isBye || g.isSpringTraining) return;
    ['home', 'away'].forEach(side => {
      ((g.playerStats && g.playerStats[side]) || []).forEach(row => {
        (rowsByPlayer[row.playerId] = rowsByPlayer[row.playerId] || []).push(normalizeStatRow(row));
      });
    });
  });
  (season.importedStatLines || []).forEach(row => {
    (rowsByPlayer[row.playerId] = rowsByPlayer[row.playerId] || []).push(normalizeStatRow(row));
  });

  const CATS = {
    avg: { label: 'Batting Avg', min: t => t.ab >= 3, value: t => battingLine(t).avg, fmt: v => v.toFixed(3).replace(/^0/, '') },
    hr: { label: 'Home Runs', min: () => true, value: t => t.hr, fmt: v => String(v) },
    rbi: { label: 'RBI', min: () => true, value: t => t.rbi, fmt: v => String(v) },
    ops: { label: 'OPS', min: t => t.ab >= 3, value: t => battingLine(t).ops, fmt: v => v.toFixed(3) },
    era: { label: 'ERA', min: t => t.outs >= 3, value: t => pitchingLine(t).era, fmt: v => v.toFixed(2), asc: true },
    k: { label: 'Strikeouts', min: () => true, value: t => t.k, fmt: v => String(v) },
  };
  const cat = CATS[category] || CATS.avg;
  const ranked = players
    .map(p => ({ ...p, totals: sumTotals(rowsByPlayer[p.playerId] || []) }))
    .filter(p => cat.min(p.totals))
    .map(p => ({ ...p, v: cat.value(p.totals) }))
    .sort((a, b) => cat.asc ? a.v - b.v : b.v - a.v)
    .slice(0, limit);
  return { label: cat.label, fmt: cat.fmt, ranked };
}

export function getNextGame(season, teamsById) {
  const upcoming = (season.games || [])
    .filter(g => !g.played && !g.isBye)
    .sort((a, b) => {
      if (a.gameTimeUTC != null && b.gameTimeUTC != null) return a.gameTimeUTC - b.gameTimeUTC;
      if (a.gameTimeUTC != null) return -1;
      if (b.gameTimeUTC != null) return 1;
      return 0;
    });
  if (upcoming.length === 0) return null;
  const g = upcoming[0];
  return { ...g, homeName: teamDisplayName(g.homeTeamId, season, teamsById), awayName: teamDisplayName(g.awayTeamId, season, teamsById) };
}
