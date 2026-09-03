function ipDisplayToOuts(ip) {
  const n = Number(ip) || 0;
  const whole = Math.trunc(n);
  const frac = Math.round((n - whole) * 10);
  return whole * 3 + Math.min(2, Math.max(0, frac));
}

export function outsToIpDisplay(outs) {
  const o = Math.max(0, Math.round(outs));
  return `${Math.floor(o / 3)}.${o % 3}`;
}

function normalizeRow(row) {
  return {
    ab: Number(row.ab) || 0, r: Number(row.r) || 0, h: Number(row.h) || 0, rbi: Number(row.rbi) || 0,
    bb: Number(row.bb) || 0, so: Number(row.so) || 0, outs: ipDisplayToOuts(row.ip),
    ha: Number(row.ha) || 0, er: Number(row.er) || 0, bbAllowed: Number(row.bbAllowed) || 0,
    k: Number(row.k) || 0, hrAllowed: Number(row.hrAllowed) || 0, e: Number(row.e) || 0,
    hr: Number(row.hr) || 0, doubles: Number(row.doubles) || 0, triples: Number(row.triples) || 0,
    g: row.g != null ? Number(row.g) || 0 : 1,
  };
}

const FIELDS = ['g', 'ab', 'r', 'h', 'rbi', 'bb', 'so', 'outs', 'ha', 'er', 'bbAllowed', 'k', 'hrAllowed', 'e', 'hr', 'doubles', 'triples'];

export function sumRows(rows) {
  const out = {};
  FIELDS.forEach(f => { out[f] = 0; });
  rows.forEach(r => FIELDS.forEach(f => { out[f] += r[f] || 0; }));
  return out;
}

function singles(t) {
  return Math.max(0, t.h - t.hr - t.doubles - t.triples);
}

export function batting(t) {
  const avg = t.ab > 0 ? t.h / t.ab : 0;
  const obpDenom = t.ab + t.bb;
  const obp = obpDenom > 0 ? (t.h + t.bb) / obpDenom : 0;
  const slg = t.ab > 0 ? (singles(t) + t.doubles * 2 + t.triples * 3 + t.hr * 4) / t.ab : 0;
  return { avg, obp, slg, ops: obp + slg };
}

export function pitching(t) {
  const era = t.outs > 0 ? (t.er * 27) / t.outs : 0;
  const whip = t.outs > 0 ? ((t.ha + t.bbAllowed) * 3) / t.outs : 0;
  return { era, whip, ip: t.outs / 3, k: t.k };
}

function rosterIndex(season) {
  const byId = new Map();
  (season.members || []).forEach(m => (m.roster || []).forEach(p => byId.set(p.id, { player: p, teamId: m.teamId })));
  (season.freeAgents || []).forEach(p => byId.set(p.id, { player: p, teamId: null }));
  return byId;
}

export function seasonPlayers(season) {
  const byId = rosterIndex(season);
  const grouped = new Map();
  (season.importedStatLines || []).forEach(line => {
    if (line.isPlayoff) return;
    const hit = byId.get(line.playerId);
    if (!hit) return;
    const entry = grouped.get(line.playerId) || { name: hit.player.name, teamId: hit.teamId, rows: [] };
    entry.rows.push(normalizeRow(line));
    grouped.set(line.playerId, entry);
  });
  return [...grouped.values()].map(e => {
    const totals = sumRows(e.rows);
    return { name: e.name, teamId: e.teamId, totals, batting: batting(totals), pitching: pitching(totals) };
  });
}

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

export function playerCareer(league, name) {
  const target = norm(name);
  if (!target) return null;
  const rows = [];
  const seasons = [];
  let display = null;
  let currentTeamId = null;

  (league.seasons || []).forEach(season => {
    const ids = new Set();
    (season.members || []).forEach(m => (m.roster || []).forEach(p => {
      if (norm(p.name) === target) {
        ids.add(p.id);
        display = display || p.name;
        if (season.id === league.activeSeasonId) currentTeamId = m.teamId;
      }
    }));
    (season.freeAgents || []).forEach(p => {
      if (norm(p.name) === target) { ids.add(p.id); display = display || p.name; }
    });
    if (ids.size === 0) return;
    seasons.push(season.name);
    (season.importedStatLines || []).forEach(line => {
      if (!line.isPlayoff && ids.has(line.playerId)) rows.push(normalizeRow(line));
    });
  });

  if (seasons.length === 0) return null;
  const totals = sumRows(rows);
  return {
    name: display || name,
    seasons,
    currentTeamId,
    totals,
    batting: batting(totals),
    pitching: pitching(totals),
    hasStats: rows.length > 0,
  };
}

export function allPlayerNames(league, prefix) {
  const q = norm(prefix);
  const names = new Set();
  (league.seasons || []).forEach(season => {
    (season.members || []).forEach(m => (m.roster || []).forEach(p => {
      if (!q || norm(p.name).includes(q)) names.add(p.name);
    }));
    (season.freeAgents || []).forEach(p => {
      if (!q || norm(p.name).includes(q)) names.add(p.name);
    });
  });
  return [...names].sort().slice(0, 25);
}
