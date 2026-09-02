export const TEAM_PALETTE = ['#2DD4BF', '#F5C64B', '#FB7166', '#7C9CF2', '#B98CE0', '#6FCF97', '#F2946B', '#5FD3E8', '#E88AC0', '#C7D15C'];

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function hashColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TEAM_PALETTE[h % TEAM_PALETTE.length];
}

export function teamColor(t) {
  return (t && t.color) || hashColor(t ? t.id : uid());
}

export function teamAbbr(t) {
  if (t && t.abbr) return t.abbr;
  const name = (t && (t.displayName || t.name)) || '';
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '???';
}

export function mergeTeam(globalTeam, member) {
  const rb = member.rebrand;
  return {
    id: member.teamId,
    scheduleName: member.scheduleName || (globalTeam ? globalTeam.name : 'Unknown team'),
    displayName: (rb && rb.name) || (globalTeam ? globalTeam.name : (member.scheduleName || 'Unknown team')),
    abbr: (rb && rb.abbr) || (globalTeam ? globalTeam.abbr : null),
    color: (rb && rb.color) || (globalTeam ? globalTeam.color : null),
    logoUrl: (rb && rb.logoUrl) || (globalTeam ? globalTeam.logoUrl : null),
    wordmarkUrl: (rb && rb.wordmarkUrl) || (globalTeam ? globalTeam.wordmarkUrl : null),
    rebrand: rb || null,
    originalName: globalTeam ? globalTeam.name : (member.scheduleName || 'Unknown team'),
    active: member.active !== false,
    baselineW: Number(member.baselineW) || 0,
    baselineL: Number(member.baselineL) || 0,
    baselineRF: Number(member.baselineRF) || 0,
    baselineRA: Number(member.baselineRA) || 0,
    roster: member.roster || [],
    divisionId: member.divisionId || null,
  };
}

export function gameWinner(g) {
  if (g.winnerOverride === 'home' || g.winnerOverride === 'away') return g.winnerOverride;
  const hs = Number(g.homeScore), as = Number(g.awayScore);
  if (Number.isNaN(hs) || Number.isNaN(as)) return null;
  if (hs > as) return 'home';
  if (as > hs) return 'away';
  return null;
}

export function computeStreak(results) {
  if (!results.length) return { type: null, count: 0, label: '—' };
  const last = results[results.length - 1];
  let count = 0;
  for (let i = results.length - 1; i >= 0; i--) { if (results[i] === last) count++; else break; }
  return { type: last, count, label: `${last}${count}` };
}

export function longestStreaks(results) {
  let bestW = 0, bestL = 0, curType = null, curCount = 0;
  results.forEach(r => {
    if (r === curType) curCount++; else { curType = r; curCount = 1; }
    if (r === 'W') bestW = Math.max(bestW, curCount); else bestL = Math.max(bestL, curCount);
  });
  return { bestW, bestL };
}

export function buildH2H(games) {
  const m = {};
  (games || []).forEach(g => {
    if (!g.played || g.isPlayoff || !g.homeTeamId || !g.awayTeamId) return;
    const hs = Number(g.homeScore), as = Number(g.awayScore);
    if (Number.isNaN(hs) || Number.isNaN(as)) return;
    const home = g.homeTeamId, away = g.awayTeamId;
    if (!m[home]) m[home] = {};
    if (!m[home][away]) m[home][away] = { w: 0, l: 0, rf: 0, ra: 0 };
    if (!m[away]) m[away] = {};
    if (!m[away][home]) m[away][home] = { w: 0, l: 0, rf: 0, ra: 0 };
    m[home][away].rf += hs; m[home][away].ra += as;
    m[away][home].rf += as; m[away][home].ra += hs;
    const winner = gameWinner(g);
    if (winner === 'home') { m[home][away].w += 1; m[away][home].l += 1; }
    else if (winner === 'away') { m[away][home].w += 1; m[home][away].l += 1; }
  });
  return m;
}

export function h2hRecord(matrix, aId, bId) {
  const a = matrix[aId] && matrix[aId][bId];
  return a ? { aWins: a.w, aLosses: a.l, aDiff: a.rf - a.ra } : { aWins: 0, aLosses: 0, aDiff: 0 };
}

export function pairCoinFlip(idA, idB) {
  const [x, y] = [idA, idB].sort();
  let h = 0;
  const s = x + '|' + y;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const firstWins = h % 2 === 0;
  return idA < idB ? firstWins : !firstWins;
}

export function getActiveSeason(league) {
  if (!league || !Array.isArray(league.seasons) || league.seasons.length === 0) return null;
  return league.seasons.find(s => s.id === league.activeSeasonId) || league.seasons[league.seasons.length - 1];
}

export function teamSlug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
