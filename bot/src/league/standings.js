import { gameWinner, teamDisplayName } from './core.js';

function computeStreak(results) {
  if (results.length === 0) return '—';
  const last = results[results.length - 1];
  let count = 0;
  for (let i = results.length - 1; i >= 0; i -= 1) {
    if (results[i] === last) count += 1;
    else break;
  }
  return `${last}${count}`;
}

function buildH2H(games) {
  const m = {};
  (games || []).forEach(g => {
    if (!g.played || g.isPlayoff || !g.homeTeamId || !g.awayTeamId) return;
    const hs = Number(g.homeScore);
    const as = Number(g.awayScore);
    if (Number.isNaN(hs) || Number.isNaN(as)) return;
    if (!m[g.homeTeamId]) m[g.homeTeamId] = {};
    if (!m[g.awayTeamId]) m[g.awayTeamId] = {};
    if (!m[g.homeTeamId][g.awayTeamId]) m[g.homeTeamId][g.awayTeamId] = { w: 0, l: 0, rf: 0, ra: 0 };
    if (!m[g.awayTeamId][g.homeTeamId]) m[g.awayTeamId][g.homeTeamId] = { w: 0, l: 0, rf: 0, ra: 0 };
    m[g.homeTeamId][g.awayTeamId].rf += hs;
    m[g.homeTeamId][g.awayTeamId].ra += as;
    m[g.awayTeamId][g.homeTeamId].rf += as;
    m[g.awayTeamId][g.homeTeamId].ra += hs;
    const w = gameWinner(g);
    if (w === 'home') { m[g.homeTeamId][g.awayTeamId].w += 1; m[g.awayTeamId][g.homeTeamId].l += 1; }
    else if (w === 'away') { m[g.awayTeamId][g.homeTeamId].w += 1; m[g.homeTeamId][g.awayTeamId].l += 1; }
  });
  return m;
}

function pairCoinFlip(idA, idB) {
  const [x, y] = [idA, idB].sort();
  const s = `${x}|${y}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const firstWins = h % 2 === 0;
  return idA < idB ? firstWins : !firstWins;
}

export function computeStandings(season, teamsById) {
  const map = {};
  (season.members || []).forEach(m => {
    if (m.active === false) return;
    map[m.teamId] = {
      id: m.teamId,
      name: teamDisplayName(m.teamId, season, teamsById),
      w: Number(m.baselineW) || 0,
      l: Number(m.baselineL) || 0,
      rf: Number(m.baselineRF) || 0,
      ra: Number(m.baselineRA) || 0,
      results: [],
    };
  });

  (season.games || []).forEach(g => {
    if (!g.played || g.isPlayoff || g.isSpringTraining || g.isBye) return;
    const home = map[g.homeTeamId];
    const away = map[g.awayTeamId];
    if (!home || !away) return;
    const hs = Number(g.homeScore);
    const as = Number(g.awayScore);
    if (Number.isNaN(hs) || Number.isNaN(as)) return;
    home.rf += hs; home.ra += as; away.rf += as; away.ra += hs;
    const w = gameWinner(g);
    if (w === 'home') { home.w += 1; away.l += 1; home.results.push('W'); away.results.push('L'); }
    else if (w === 'away') { away.w += 1; home.l += 1; away.results.push('W'); home.results.push('L'); }
  });

  const h2h = buildH2H(season.games || []);
  const rows = Object.values(map).map(t => {
    const gp = t.w + t.l;
    return { ...t, gp, pct: gp > 0 ? t.w / gp : 0, diff: t.rf - t.ra, streak: computeStreak(t.results) };
  }).sort((a, b) => {
    if (b.pct !== a.pct) return b.pct - a.pct;
    if (b.diff !== a.diff) return b.diff - a.diff;
    const rec = h2h[a.id] && h2h[a.id][b.id];
    if (rec && (rec.w + rec.l) > 0 && rec.w !== rec.l) return rec.w > rec.l ? -1 : 1;
    if (rec && rec.rf - rec.ra !== 0) return rec.rf - rec.ra > 0 ? -1 : 1;
    return pairCoinFlip(a.id, b.id) ? -1 : 1;
  });

  const leader = rows[0];
  rows.forEach((t, i) => {
    t.rank = i + 1;
    t.gb = leader ? ((leader.w - t.w) + (t.l - leader.l)) / 2 : 0;
  });
  return rows;
}
