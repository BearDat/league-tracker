'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, Cell, ScatterChart, Scatter, ReferenceLine, ZAxis
} from 'recharts';
import {
  Trophy, Calendar, Users, BarChart3, Percent, Plus, Trash2, Upload,
  ChevronRight, ChevronLeft, Pencil, Check, X, Folder, Save, RefreshCw, ArrowLeft,
  Activity, AlertTriangle, Image as ImageIcon, Layers, Crown, History, Sparkles, Home as HomeIcon, Settings as SettingsIcon,
  Award as AwardIcon
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { AuthProvider, useAuth } from '../lib/AuthContext';
import LoginControl from './LoginControl';

// Single league this site serves. Set once you've created your league (see
// README) — skips the original app's multi-league picker screen entirely.
const FIXED_LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID || null;

/* ==================================================================== */
/* Theme                                                                 */
/* ==================================================================== */
// Default hex values, kept as constants for pickers/fallbacks. The colors
// actually used in styles below reference CSS custom properties instead,
// so the Appearance settings can change them live without prop-drilling
// through every component.
const DEFAULT_THEME = { chalk: '#F3F5FA', chalkDim: '#93A0B8', primary: '#2DD4BF', ink: '#080B11', panel: '#121826', panel2: '#1C2536', line: '#313C54' };
const INK = 'var(--lt-ink, #080B11)';
const PANEL = 'var(--lt-panel, #121826)';
const PANEL2 = 'var(--lt-panel2, #1C2536)';
const FIELD_BG = '#222D42';
const LINE = 'var(--lt-line, #313C54)';
const CHALK = 'var(--lt-chalk, #F3F5FA)';
const CHALK_DIM = 'var(--lt-chalk-dim, #93A0B8)';
const PRIMARY = 'var(--lt-primary, #2DD4BF)';
const NEGATIVE = '#FB7166';
const GOLD = '#F5C64B';
// WIN is a dedicated "good/positive" green, deliberately separate from PRIMARY
// (the UI's teal accent color). PRIMARY is for chrome — buttons, active tabs,
// section titles — never for "this number is good" semantics; WIN is for that.
const WIN = '#4ADE80';
// Full theme presets, applied all at once via the "Preset" buttons in
// Appearance settings — a light mode wouldn't work by only swapping text
// colors, since the panel/background colors need to flip too.
const THEME_PRESETS = {
  dark: { chalk: '#F3F5FA', chalkDim: '#93A0B8', primary: '#2DD4BF', ink: '#080B11', panel: '#121826', panel2: '#1C2536', line: '#313C54' },
  light: { chalk: '#1A2130', chalkDim: '#5B6472', primary: '#0D9488', ink: '#F4F6FA', panel: '#FFFFFF', panel2: '#EEF1F6', line: '#DCE1E8' },
};

const TEAM_PALETTE = ['#2DD4BF', '#F5C64B', '#FB7166', '#7C9CF2', '#B98CE0', '#6FCF97', '#F2946B', '#5FD3E8', '#E88AC0', '#C7D15C'];

const DEFAULT_SETTINGS = { playoffSpots: 4, simRuns: 2000, standardInnings: 7, oddsDecimals: 1, scheduleMode: 'date', seriesLength: 1, oddsFormat: 'percent', homeFieldBoost: 4, playoffFormat: 'overall', playInTeams: 0 };
// Sport selected at league creation. Drives terminology (innings vs quarters
// vs periods, runs vs points vs goals) and the default regulation length —
// the underlying game mechanics (two scores, win/loss, best-of-N playoff
// series) stay the same across sports; this is a terminology layer, not a
// full separate rules engine per sport.
const SPORT_PRESETS = {
  baseball: { label: 'Baseball / Softball', period: 'inning', periodPlural: 'innings', periodAbbr: 'inn', score: 'run', scorePlural: 'runs', scoreAbbr: 'R', regulation: 7 },
  basketball: { label: 'Basketball', period: 'quarter', periodPlural: 'quarters', periodAbbr: 'qtr', score: 'point', scorePlural: 'points', scoreAbbr: 'PTS', regulation: 4 },
  hockey: { label: 'Hockey', period: 'period', periodPlural: 'periods', periodAbbr: 'per', score: 'goal', scorePlural: 'goals', scoreAbbr: 'G', regulation: 3 },
  football: { label: 'Football', period: 'quarter', periodPlural: 'quarters', periodAbbr: 'qtr', score: 'point', scorePlural: 'points', scoreAbbr: 'PTS', regulation: 4 },
  soccer: { label: 'Soccer', period: 'half', periodPlural: 'halves', periodAbbr: 'half', score: 'goal', scorePlural: 'goals', scoreAbbr: 'G', regulation: 2 },
};
function sportOf(league) { return SPORT_PRESETS[league && league.sport] || SPORT_PRESETS.baseball; }
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
// Baseball/softball is the only preset with a top/bottom split; everything
// else (quarters, periods, halves) is just a plain period number.
function formatLivePeriod(sport, period, half) {
  if (!period) return null;
  if (sport.period === 'inning' && half) return `${half === 'top' ? 'Top' : 'Bot'} ${ordinal(period)}`;
  return `${ordinal(period)} ${sport.period}`;
}

/* ==================================================================== */
/* Core utilities                                                        */
/* ==================================================================== */
function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function hashColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TEAM_PALETTE[h % TEAM_PALETTE.length];
}
function teamColor(t) { return (t && t.color) || hashColor(t ? t.id : uid()); }
function fmtPct(x, decimals) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${x.toFixed(decimals)}%`;
}
// American ("moneyline") odds — e.g. +125 or -150 — computed from a win probability.
function toAmericanOdds(pctChance) {
  if (pctChance == null || Number.isNaN(pctChance)) return '—';
  // Standard American odds formula, uncapped (real sportsbooks do show
  // extreme lines like -3000+ for lopsided matchups) — just guarded against
  // literal 0%/100% to avoid a divide-by-zero.
  const p = Math.min(99, Math.max(1, pctChance)) / 100;
  if (p >= 0.5) {
    const val = Math.round(-100 * p / (1 - p));
    return `${val}`;
  }
  const val = Math.round(100 * (1 - p) / p);
  return `+${val}`;
}
function fmtOdds(pctChance, format, decimals) {
  if (format === 'american') return toAmericanOdds(pctChance);
  return fmtPct(pctChance, decimals);
}
function regularizedPct(w, l) { const gp = w + l; return (w + 1) / (gp + 2); }

function pythPct(rf, ra) {
  const rf2 = (rf || 0) * (rf || 0), ra2 = (ra || 0) * (ra || 0);
  return (rf2 + ra2) > 0 ? rf2 / (rf2 + ra2) : 0.5;
}
function last10Pct(results) {
  if (!results || results.length === 0) return null;
  return results.filter(r => r === 'W').length / results.length;
}
// Blends five signals into a single win probability for teamA hosting/facing
// teamB: (1) overall win% (log5), (2) Pythagorean expectation from RS/RA — this
// smooths out win/loss noise, especially in small samples, using actual scoring,
// (3) recent form (last 10 games), (4) roster star-rating strength (an
// admittedly fuzzy but fun signal — real talent isn't fully captured by a
// partial-season record), and (5) head-to-head history including its own run
// differential. Each add-on factor is capped so it nudges rather than swamps
// the underlying record.
function winProb(teamA, teamB, h2h) {
  const pA = regularizedPct(teamA.w, teamA.l);
  const pB = regularizedPct(teamB.w, teamB.l);
  const denom = pA + pB - 2 * pA * pB;
  let base = denom <= 0 ? 0.5 : (pA - pA * pB) / denom;

  const pythA = pythPct(teamA.rf, teamA.ra), pythB = pythPct(teamB.rf, teamB.ra);
  const pythDenom = pythA + pythB - 2 * pythA * pythB;
  const pythBase = pythDenom > 0 ? (pythA - pythA * pythB) / pythDenom : 0.5;
  base = base * 0.7 + pythBase * 0.3;

  const formA = last10Pct(teamA.last10), formB = last10Pct(teamB.last10);
  if (formA != null && formB != null) base += Math.max(-0.08, Math.min(0.08, (formA - formB) * 0.16));

  const rsA = rosterStrength(teamA.roster), rsB = rosterStrength(teamB.roster);
  if (rsA != null && rsB != null) base += Math.max(-0.06, Math.min(0.06, (rsA - rsB) * 0.03));

  base = Math.min(0.97, Math.max(0.03, base));
  if (h2h) {
    const n = h2h.aWins + h2h.aLosses;
    if (n > 0) {
      const h2hP = (h2h.aWins + 0.5) / (n + 1);
      const weight = Math.min(0.5, n * 0.15);
      base = weight * h2hP + (1 - weight) * base;
      // Nudge further using head-to-head run differential (average runs/game
      // margin in their own matchups), capped to a small effect so it can't
      // swing the odds on its own — win/loss record still dominates.
      if (h2h.aDiff != null) {
        const avgDiff = h2h.aDiff / n;
        const nudge = Math.max(-0.06, Math.min(0.06, avgDiff * 0.01));
        base = base + nudge;
      }
      base = Math.min(0.97, Math.max(0.03, base));
    }
  }
  return base;
}

// Generates 1-2 short pre-game blurbs for a matchup using data already on
// hand — streaks, head-to-head history, and standings context — rather than
// anything invented. Ordered roughly by how notable each angle is.
function generateStorylines(home, away, h2hMatrix, playoffSpots) {
  if (!home || !away) return [];
  const candidates = [];
  [{ t: home, opp: away }, { t: away, opp: home }].forEach(({ t, opp }) => {
    if (t.streak.type === 'W' && t.streak.count >= 4) candidates.push({ priority: 3, text: `${t.displayName} rides a ${t.streak.count}-game winning streak into this one.` });
    else if (t.streak.type === 'L' && t.streak.count >= 4) candidates.push({ priority: 3, text: `${t.displayName} looks to snap a ${t.streak.count}-game skid.` });
  });
  const h2h = h2hMatrix[home.id] && h2hMatrix[home.id][away.id];
  if (h2h && (h2h.w + h2h.l) > 0) {
    if (h2h.w === h2h.l) candidates.push({ priority: 2, text: `${home.displayName} and ${away.displayName} are even at ${h2h.w}-${h2h.l} in the season series.` });
    else {
      const homeLeads = h2h.w > h2h.l;
      const leaderName = homeLeads ? home.displayName : away.displayName;
      const hi = Math.max(h2h.w, h2h.l), lo = Math.min(h2h.w, h2h.l);
      candidates.push({ priority: 2, text: `${leaderName} leads the season series ${hi}-${lo} coming in.` });
    }
  } else {
    candidates.push({ priority: 1, text: `First meeting of the season between these two.` });
  }
  if (home.rank === 1 && away.rank === 2) candidates.push({ priority: 5, text: `First place is on the line — these two sit 1-2 in the standings.` });
  else if (home.rank === 2 && away.rank === 1) candidates.push({ priority: 5, text: `First place is on the line — these two sit 1-2 in the standings.` });
  if (playoffSpots) {
    const bubbleHome = home.rank === playoffSpots || home.rank === playoffSpots + 1;
    const bubbleAway = away.rank === playoffSpots || away.rank === playoffSpots + 1;
    if (bubbleHome || bubbleAway) candidates.push({ priority: 4, text: `A playoff-race game — both teams are within a game of the cutoff.` });
  }
  if (Math.abs(home.rank - away.rank) === 1 && Math.abs(home.gb - away.gb) <= 0.5) {
    candidates.push({ priority: 2, text: `Just ${Math.abs(home.gb - away.gb).toFixed(1) === '0.0' ? 'percentage points' : `${Math.abs(home.gb - away.gb).toFixed(1)} games`} separate these two in the standings.` });
  }
  return candidates.sort((a, b) => b.priority - a.priority).slice(0, 2).map(c => c.text);
}

function buildH2H(games) {
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
function h2hRecord(matrix, aId, bId) {
  const a = matrix[aId] && matrix[aId][bId];
  return a ? { aWins: a.w, aLosses: a.l, aDiff: a.rf - a.ra } : { aWins: 0, aLosses: 0, aDiff: 0 };
}
// Deterministic "coin flip" for a pair of teams — stable across renders (won't
// flicker every recompute) but effectively arbitrary/unpredictable per pair.
function pairCoinFlip(idA, idB) {
  const [x, y] = [idA, idB].sort();
  let h = 0;
  const s = x + '|' + y;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const firstWins = h % 2 === 0; // true = the alphabetically-first id wins the flip
  return idA < idB ? firstWins : !firstWins;
}

// Normalizes a round/date label for display, fixing any double "Round Round #"
// that can happen if the raw label already contains a "Round"/"Rd" prefix
// (e.g. from data entered before a season switched to round-labeled mode).
function formatRoundLabel(label) {
  if (!label) return '';
  const s = String(label);
  if (/^playoffs?\b/i.test(s)) return s; // playoff round labels ("Playoffs R1") are used as-is
  const stripped = s.replace(/^(round|rd|r)\.?\s*#?\s*/i, '').trim();
  return `Round ${stripped || s}`;
}
function gameWinner(g) {
  if (g.winnerOverride === 'home' || g.winnerOverride === 'away') return g.winnerOverride;
  const hs = Number(g.homeScore), as = Number(g.awayScore);
  if (Number.isNaN(hs) || Number.isNaN(as)) return null;
  if (hs > as) return 'home';
  if (as > hs) return 'away';
  return null;
}

function computeStreak(results) {
  if (!results.length) return { type: null, count: 0, label: '—' };
  const last = results[results.length - 1];
  let count = 0;
  for (let i = results.length - 1; i >= 0; i--) { if (results[i] === last) count++; else break; }
  return { type: last, count, label: `${last}${count}` };
}
function longestStreaks(results) {
  let bestW = 0, bestL = 0, curType = null, curCount = 0;
  results.forEach(r => {
    if (r === curType) curCount++; else { curType = r; curCount = 1; }
    if (r === 'W') bestW = Math.max(bestW, curCount); else bestL = Math.max(bestL, curCount);
  });
  return { bestW, bestL };
}

function nextPow2(n) { let p = 1; while (p < n) p *= 2; return Math.max(p, 1); }
function seedOrder(size) {
  if (size <= 1) return [1];
  const prev = seedOrder(size / 2);
  const result = [];
  prev.forEach(s => { result.push(s); result.push(size + 1 - s); });
  return result;
}

/* ---- playoff bracket generation (real, scheduled games) ---- */
function seriesWinsNeeded(seriesLength) { return Math.ceil((seriesLength || 1) / 2); }
// Resolves the series length for a specific playoff round: uses settings.seriesLengths[round-1]
// if that's been configured, otherwise carries forward the LAST explicitly-configured round's
// length (not the unrelated scalar default) — so if playoffSpots grows and adds a new round
// after per-round lengths were already set, the new round doesn't silently fall back to a
// possibly-stale, unrelated value. Falls back to the plain scalar only if no array exists at all.
function getSeriesLength(settings, round) {
  if (settings && Array.isArray(settings.seriesLengths) && settings.seriesLengths.length > 0) {
    if (settings.seriesLengths[round - 1]) return settings.seriesLengths[round - 1];
    return settings.seriesLengths[settings.seriesLengths.length - 1] || (settings.seriesLength || 1);
  }
  return (settings && settings.seriesLength) || 1;
}

// Play-in tournament: a single-elimination mini-bracket among bubble teams
// (seeded just below the automatic playoff cutoff) that determines who takes
// the final playoff spot — the last seed is "up for grabs" rather than locked
// in by regular-season record alone. Always single games (no best-of-N —
// play-ins are meant to be a compressed, high-stakes single elimination).
function generatePlayInRound1(standings, playoffSpots, playInTeams) {
  const bubble = standings.slice(Math.max(0, playoffSpots - 1), Math.max(0, playoffSpots - 1) + playInTeams);
  if (bubble.length < 2) return [];
  const bracketSize = nextPow2(bubble.length);
  const order = seedOrder(bracketSize);
  const games = [];
  for (let i = 0; i < order.length; i += 2) {
    const s1 = order[i], s2 = order[i + 1];
    const t1 = s1 <= bubble.length ? bubble[s1 - 1] : null;
    const t2 = s2 <= bubble.length ? bubble[s2 - 1] : null;
    const slot = i / 2;
    if (t1 && t2) {
      games.push({ id: uid('g'), date: 'Play-In R1', isPlayIn: true, playInRound: 1, bracketSlot: slot, homeTeamId: t1.id, awayTeamId: t2.id, awayScheduleName: t2.displayName, homeScheduleName: t1.displayName, awayScore: null, homeScore: null, innings: null, played: false });
    } else if (t1 || t2) {
      const t = t1 || t2;
      games.push({ id: uid('g'), date: 'Play-In R1', isPlayIn: true, playInRound: 1, bracketSlot: slot, homeTeamId: t.id, awayTeamId: null, awayScheduleName: 'BYE', homeScheduleName: t.displayName, awayScore: 0, homeScore: 1, innings: 0, played: true, isBye: true });
    }
  }
  return games;
}
// Advances the play-in bracket once its current round is fully played, same
// bye-chain handling as advancePlayoffs but simpler (no series, no home-field
// alternation). Returns the games array and, once decided, the winning teamId.
function advancePlayIn(games) {
  let result = [...games];
  let winner;
  let changed = true;
  while (changed) {
    changed = false;
    const playInGames = result.filter(g => g.isPlayIn);
    if (playInGames.length === 0) break;
    const maxRound = Math.max(...playInGames.map(g => g.playInRound));
    const roundGames = playInGames.filter(g => g.playInRound === maxRound);
    if (result.some(g => g.isPlayIn && g.playInRound === maxRound + 1)) break;
    if (!roundGames.every(g => g.played)) break;
    const winners = roundGames.sort((a, b) => a.bracketSlot - b.bracketSlot).map(g => {
      const w = gameWinner(g);
      return w === 'home' ? g.homeTeamId : g.awayTeamId;
    });
    if (winners.length === 1) { winner = winners[0]; break; }
    const newGames = [];
    for (let i = 0; i < winners.length; i += 2) {
      newGames.push({ id: uid('g'), date: `Play-In R${maxRound + 1}`, isPlayIn: true, playInRound: maxRound + 1, bracketSlot: i / 2, homeTeamId: winners[i], awayTeamId: winners[i + 1], awayScheduleName: null, homeScheduleName: null, awayScore: null, homeScore: null, innings: null, played: false });
    }
    result = [...result, ...newGames];
    changed = true;
  }
  return { games: result, winner };
}
function getPlayInWinner(games) {
  const playInGames = (games || []).filter(g => g.isPlayIn);
  if (playInGames.length === 0) return null;
  const maxRound = Math.max(...playInGames.map(g => g.playInRound));
  const roundGames = playInGames.filter(g => g.playInRound === maxRound);
  if (roundGames.length !== 1 || !roundGames[0].played) return null;
  const w = gameWinner(roundGames[0]);
  return w === 'home' ? roundGames[0].homeTeamId : roundGames[0].awayTeamId;
}

function generatePlayoffRound1(standings, playoffSpots, seriesLength) {
  const n = Math.min(playoffSpots, standings.length);
  if (n < 2) return [];
  const bracketSize = nextPow2(n);
  const order = seedOrder(bracketSize);
  const games = [];
  for (let i = 0; i < order.length; i += 2) {
    const s1 = order[i], s2 = order[i + 1];
    const t1 = s1 <= n ? standings[s1 - 1] : null;
    const t2 = s2 <= n ? standings[s2 - 1] : null;
    const slot = i / 2;
    if (t1 && t2) {
      // Higher seed hosts game 1 (and gets home-field advantage through the series).
      games.push({ id: uid('g'), date: 'Playoffs R1', isPlayoff: true, playoffRound: 1, bracketSlot: slot, seriesGame: 1, higherSeedId: t1.id, awayTeamId: t2.id, homeTeamId: t1.id, awayScheduleName: t2.displayName, homeScheduleName: t1.displayName, awayScore: null, homeScore: null, innings: null, played: false });
    } else if (t1 || t2) {
      const t = t1 || t2;
      games.push({ id: uid('g'), date: 'Playoffs R1', isPlayoff: true, playoffRound: 1, bracketSlot: slot, seriesGame: 1, higherSeedId: t.id, awayTeamId: null, homeTeamId: t.id, awayScheduleName: 'BYE', homeScheduleName: t.displayName, awayScore: 0, homeScore: 1, innings: 0, played: true, isBye: true });
    }
  }
  return games;
}

// Advances playoff series into the next round (or generates the next game of
// a series still in progress). Re-derives EVERY round on each pass (not just
// the newest one) so that correcting an earlier game's winner — even after
// later rounds were already generated — properly adds a needed replacement
// game to a series that's now tied again, and discards/regenerates any
// downstream rounds that no longer reflect the corrected result. Optionally
// reseeds each new round (best remaining seed vs. worst remaining seed)
// instead of fixed bracket-position pairings, when seedById is supplied and
// settings.reseedPlayoffs is on. Returns the updated games array and a
// championTeamId once the final series is decided (undefined = no change).
function advancePlayoffs(games, settings, seedById) {
  let result = [...games];
  let championTeamId;
  let changed = true;
  while (changed) {
    changed = false;
    const playoffRoundNums = [...new Set(result.filter(g => g.isPlayoff).map(g => g.playoffRound))].sort((a, b) => a - b);
    if (playoffRoundNums.length === 0) break;

    for (const round of playoffRoundNums) {
      const sl = getSeriesLength(settings, round);
      const winsNeeded = seriesWinsNeeded(sl);
      const roundGames = result.filter(g => g.isPlayoff && g.playoffRound === round);
      const slots = [...new Set(roundGames.map(g => g.bracketSlot))].sort((a, b) => a - b);

      let allDecided = true;
      const slotWinner = {};
      let addedGameThisRound = false;

      for (const slot of slots) {
        const slotGames = roundGames.filter(g => g.bracketSlot === slot).sort((a, b) => (a.seriesGame || 1) - (b.seriesGame || 1));
        if (slotGames.length === 1 && slotGames[0].isBye) { slotWinner[slot] = slotGames[0].homeTeamId; continue; }
        const teamIds = new Set();
        slotGames.forEach(g => { if (g.homeTeamId) teamIds.add(g.homeTeamId); if (g.awayTeamId) teamIds.add(g.awayTeamId); });
        const wins = {};
        [...teamIds].forEach(id => { wins[id] = 0; });
        slotGames.forEach(g => {
          if (!g.played) return;
          const w = gameWinner(g);
          const wid = w === 'home' ? g.homeTeamId : w === 'away' ? g.awayTeamId : null;
          if (wid != null) wins[wid] = (wins[wid] || 0) + 1;
        });
        const decidedTeam = [...teamIds].find(id => wins[id] >= winsNeeded);
        if (decidedTeam) { slotWinner[slot] = decidedTeam; continue; }
        allDecided = false;
        const gamesPlayed = slotGames.filter(g => g.played).length;
        const nextGameNum = gamesPlayed + 1;
        const hasNextGame = slotGames.some(g => (g.seriesGame || 1) === nextGameNum);
        if (!hasNextGame && gamesPlayed > 0 && gamesPlayed < sl) {
          const higherSeedId = slotGames[0].higherSeedId || slotGames[0].homeTeamId;
          const [idA, idB] = [...teamIds];
          const lowerSeedId = idA === higherSeedId ? idB : idA;
          const hostId = nextGameNum % 2 === 1 ? higherSeedId : lowerSeedId;
          const awayId = hostId === higherSeedId ? lowerSeedId : higherSeedId;
          result.push({ id: uid('g'), date: `Playoffs R${round}`, isPlayoff: true, playoffRound: round, bracketSlot: slot, seriesGame: nextGameNum, higherSeedId, homeTeamId: hostId, awayTeamId: awayId, awayScheduleName: null, homeScheduleName: null, awayScore: null, homeScore: null, innings: null, played: false });
          changed = true;
          addedGameThisRound = true;
        }
      }
      // A game was just added to fill out this round's series (because an
      // earlier edit reopened it) — restart the pass so everything downstream
      // recomputes cleanly against the corrected state.
      if (addedGameThisRound) break;

      const nextRoundExists = result.some(g => g.isPlayoff && g.playoffRound === round + 1);

      if (allDecided && slots.length > 0) {
        let winners = slots.map(s => slotWinner[s]);
        if (winners.length >= 2) {
          if (settings.reseedPlayoffs && seedById) {
            winners = [...winners].sort((a, b) => (seedById[a] ?? 999) - (seedById[b] ?? 999));
            const paired = [];
            for (let i = 0, j = winners.length - 1; i < j; i++, j--) paired.push(winners[i], winners[j]);
            winners = paired;
          }
          if (!nextRoundExists) {
            const newGames = [];
            for (let i = 0; i < winners.length; i += 2) {
              newGames.push({ id: uid('g'), date: `Playoffs R${round + 1}`, isPlayoff: true, playoffRound: round + 1, bracketSlot: i / 2, seriesGame: 1, higherSeedId: winners[i], awayTeamId: winners[i + 1], homeTeamId: winners[i], awayScheduleName: null, homeScheduleName: null, awayScore: null, homeScore: null, innings: null, played: false });
            }
            result = [...result, ...newGames];
            changed = true;
            break;
          } else {
            // Next round already exists — check it actually reflects these
            // winners. A mismatch means an earlier result was corrected after
            // this round was generated, so wipe every round after this one
            // and regenerate it fresh from the corrected winners.
            const nextRoundGames = result.filter(g => g.isPlayoff && g.playoffRound === round + 1);
            const nextSlots = [...new Set(nextRoundGames.map(g => g.bracketSlot))].sort((a, b) => a - b);
            let mismatch = false;
            nextSlots.forEach(ns => {
              const expectedA = winners[ns * 2], expectedB = winners[ns * 2 + 1];
              const slotGames = nextRoundGames.filter(g => g.bracketSlot === ns);
              const actualIds = new Set();
              slotGames.forEach(g => { if (g.homeTeamId) actualIds.add(g.homeTeamId); if (g.awayTeamId) actualIds.add(g.awayTeamId); });
              const expectedIds = new Set([expectedA, expectedB].filter(Boolean));
              if (actualIds.size !== expectedIds.size || [...expectedIds].some(id => !actualIds.has(id))) mismatch = true;
            });
            if (mismatch) {
              result = result.filter(g => !(g.isPlayoff && g.playoffRound > round));
              const newGames = [];
              for (let i = 0; i < winners.length; i += 2) {
                newGames.push({ id: uid('g'), date: `Playoffs R${round + 1}`, isPlayoff: true, playoffRound: round + 1, bracketSlot: i / 2, seriesGame: 1, higherSeedId: winners[i], awayTeamId: winners[i + 1], homeTeamId: winners[i], awayScheduleName: null, homeScheduleName: null, awayScore: null, homeScore: null, innings: null, played: false });
              }
              result = [...result, ...newGames];
              changed = true;
              break;
            }
          }
        } else if (winners.length === 1) {
          championTeamId = winners[0];
        }
      } else if (nextRoundExists) {
        // This round is no longer fully decided (an edit reopened a slot),
        // but a later round already exists from before that correction —
        // it's now built on an incomplete/incorrect foundation, so discard it.
        result = result.filter(g => !(g.isPlayoff && g.playoffRound > round));
        changed = true;
        break;
      }
    }
  }
  return { games: result, championTeamId };
}

/* ---- team merging (global team branding + per-season membership) ---- */
function mergeTeam(globalTeam, member) {
  return {
    id: member.teamId,
    scheduleName: member.scheduleName || (globalTeam ? globalTeam.name : 'Unknown team'),
    displayName: globalTeam ? globalTeam.name : (member.scheduleName || 'Unknown team'),
    color: globalTeam ? globalTeam.color : null,
    logoUrl: globalTeam ? globalTeam.logoUrl : null,
    wordmarkUrl: globalTeam ? globalTeam.wordmarkUrl : null,
    active: member.active !== false,
    baselineW: Number(member.baselineW) || 0, baselineL: Number(member.baselineL) || 0,
    baselineRF: Number(member.baselineRF) || 0, baselineRA: Number(member.baselineRA) || 0,
    roster: member.roster || [],
    divisionId: member.divisionId || null,
  };
}

/* ---- players & rosters ---- */
// starLevel is a plain number (supports 0.5 increments, and can exceed 5 — real
// sheets go up to ~5.5+) or null, meaning "R" (unrated/reserve).
function newPlayer(name, starLevel) {
  return { id: uid('p'), name, starLevel: starLevel === undefined ? null : starLevel, role: '', number: '', position: '' };
}
function formatStarLevel(v) { return (v == null || v === 'R') ? 'R' : `${v}★`; }
// Average roster star level for a team, used as a small strength signal in odds
// (an "imagination" factor — real talent isn't fully captured by record alone,
// especially early in a season with few games played). Unrated ("R") players
// are excluded rather than assumed average, since we genuinely don't know.
function rosterStrength(roster) {
  if (!roster || roster.length === 0) return null;
  const rated = roster.filter(p => typeof p.starLevel === 'number');
  if (rated.length === 0) return null;
  return rated.reduce((s, p) => s + p.starLevel, 0) / rated.length;
}
function parseStarValue(raw) {
  const s = String(raw || '').trim();
  if (!s || /^r$/i.test(s)) return null;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function parseRosterText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map(line => {
    const parts = line.split(',').map(p => p.trim());
    const name = parts[0] || '';
    const starLevel = parseStarValue(parts[1]);
    const number = parts[2] || '';
    const position = parts[3] || '';
    return { name, starLevel, number, position, matched: !!name };
  });
}
// Parses a whole roster spreadsheet exported as CSV: many teams laid out as
// repeating 3-column blocks (Role/Slot, Username, Stars), possibly with
// several such rows of team-blocks stacked one below another (each with its
// own "Team | <name> | Stars" header row). Finds every header wherever it
// appears and reads that block's players until a "Star Total" row, a blank
// role+username pair, or the next header at the same columns.
function parseRosterSheetCsv(text) {
  function splitCsvLine(line) {
    const cells = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
        else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { cells.push(cur); cur = ''; }
        else cur += c;
      }
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  }
  const rows = text.split(/\r?\n/).filter(l => l.length > 0).map(splitCsvLine);
  const blocks = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const isHeader = /^team$/i.test(row[c] || '') && /^stars?$/i.test(row[c + 2] || '');
      if (!isHeader) continue;
      const teamName = (row[c + 1] || '').trim();
      if (!teamName) continue;
      const players = [];
      for (let rr = r + 1; rr < rows.length; rr++) {
        const drow = rows[rr];
        const role = (drow[c] || '').trim();
        const uname = (drow[c + 1] || '').trim();
        const starsRaw = (drow[c + 2] || '').trim();
        if (/star total/i.test(role) || /star total/i.test(uname)) break;
        if (/^team$/i.test(role)) break; // next stacked section's header reusing these columns
        if (!role && !uname && !starsRaw) break;
        if (!uname) continue; // empty roster slot, keep scanning
        players.push({ role, name: uname, starLevel: parseStarValue(starsRaw) });
      }
      blocks.push({ teamName, players });
    }
  }
  return blocks;
}

/* ---- awards ---- */
function newAwardDef(name, description) { return { id: uid('award'), name, description: description || '' }; }

/* ---- standings ---- */
function computeStandings(season, teamsById) {
  const standardInnings = (season.settings && season.settings.standardInnings) || 7;
  const map = {};
  (season.members || []).forEach(m => {
    const base = mergeTeam(teamsById[m.teamId] || null, m);
    map[m.teamId] = {
      ...base,
      w: base.baselineW, l: base.baselineL, rf: base.baselineRF, ra: base.baselineRA,
      results: [], oneRunW: 0, oneRunL: 0, xInnW: 0, xInnL: 0, defInnings: 0, forfeitW: 0, forfeitL: 0,
      homeW: 0, homeL: 0, homeRF: 0, homeRA: 0, awayW: 0, awayL: 0, awayRF: 0, awayRA: 0,
    };
  });
  (season.games || []).forEach(g => {
    if (!g.played || g.isPlayoff) return;
    const home = map[g.homeTeamId], away = map[g.awayTeamId];
    if (!home || !away) return;
    const hs = Number(g.homeScore), as = Number(g.awayScore);
    if (Number.isNaN(hs) || Number.isNaN(as)) return;
    home.rf += hs; home.ra += as; away.rf += as; away.ra += hs;
    home.homeRF += hs; home.homeRA += as; away.awayRF += as; away.awayRA += hs;
    const innings = g.isForfeit ? 0 : (Number(g.innings) || standardInnings);
    home.defInnings += innings; away.defInnings += innings;
    const margin = Math.abs(hs - as);
    const isXI = !g.isForfeit && innings > standardInnings;
    const winner = gameWinner(g);
    if (winner === 'home') {
      home.w += 1; away.l += 1; home.homeW += 1; away.awayL += 1;
      home.results.push('W'); away.results.push('L');
      if (g.isForfeit) { home.forfeitW += 1; away.forfeitL += 1; }
      if (!g.isForfeit && margin === 1) { home.oneRunW += 1; away.oneRunL += 1; }
      if (isXI) { home.xInnW += 1; away.xInnL += 1; }
    } else if (winner === 'away') {
      away.w += 1; home.l += 1; away.awayW += 1; home.homeL += 1;
      away.results.push('W'); home.results.push('L');
      if (g.isForfeit) { away.forfeitW += 1; home.forfeitL += 1; }
      if (!g.isForfeit && margin === 1) { away.oneRunW += 1; home.oneRunL += 1; }
      if (isXI) { away.xInnW += 1; home.xInnL += 1; }
    }
  });

  let fullArr = Object.values(map).map(t => {
    const gp = t.w + t.l;
    const homeGp = t.homeW + t.homeL, awayGp = t.awayW + t.awayL;
    const streaks = longestStreaks(t.results);
    return {
      ...t, gp, pct: gp > 0 ? t.w / gp : 0, diff: t.rf - t.ra,
      rsPerG: gp > 0 ? t.rf / gp : 0, raPerG: gp > 0 ? t.ra / gp : 0,
      homeGp, awayGp,
      homeRsPerG: homeGp > 0 ? t.homeRF / homeGp : 0, homeRaPerG: homeGp > 0 ? t.homeRA / homeGp : 0,
      awayRsPerG: awayGp > 0 ? t.awayRF / awayGp : 0, awayRaPerG: awayGp > 0 ? t.awayRA / awayGp : 0,
      streak: computeStreak(t.results), longestWinStreak: streaks.bestW, longestLossStreak: streaks.bestL,
      last10: t.results.slice(-10),
    };
  });

  const pctById = {};
  fullArr.forEach(t => { pctById[t.id] = t.pct; });
  const oppAgg = {};
  const sovAgg = {};
  (season.games || []).forEach(g => {
    if (g.isPlayoff) return;
    if (!g.homeTeamId || !g.awayTeamId) return;
    if (!(g.homeTeamId in pctById) || !(g.awayTeamId in pctById)) return;
    if (!oppAgg[g.homeTeamId]) oppAgg[g.homeTeamId] = { sum: 0, count: 0 };
    if (!oppAgg[g.awayTeamId]) oppAgg[g.awayTeamId] = { sum: 0, count: 0 };
    oppAgg[g.homeTeamId].sum += pctById[g.awayTeamId]; oppAgg[g.homeTeamId].count += 1;
    oppAgg[g.awayTeamId].sum += pctById[g.homeTeamId]; oppAgg[g.awayTeamId].count += 1;
    if (!g.played) return;
    // Strength of victory: same idea as strength of schedule, but only
    // averaging the quality of opponents actually BEATEN — distinct from SOS
    // (which averages every opponent played, win or lose).
    const w = gameWinner(g);
    if (!w) return;
    const winnerId = w === 'home' ? g.homeTeamId : g.awayTeamId, loserId = w === 'home' ? g.awayTeamId : g.homeTeamId;
    if (!sovAgg[winnerId]) sovAgg[winnerId] = { sum: 0, count: 0 };
    sovAgg[winnerId].sum += pctById[loserId]; sovAgg[winnerId].count += 1;
  });
  fullArr = fullArr.map(t => {
    const oc = oppAgg[t.id];
    const sc = sovAgg[t.id];
    return { ...t, sos: oc && oc.count > 0 ? oc.sum / oc.count : null, sov: sc && sc.count > 0 ? sc.sum / sc.count : null };
  });

  const h2hMatrix = buildH2H(season.games || []);
  const activeArr = fullArr.filter(t => t.active)
    .sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;
      // 1. Run differential (season-wide)
      if (b.diff !== a.diff) return b.diff - a.diff;
      // 2. Head-to-head record
      const rec = h2hMatrix[a.id] && h2hMatrix[a.id][b.id];
      if (rec && (rec.w + rec.l) > 0 && rec.w !== rec.l) return rec.w > rec.l ? -1 : 1;
      // 3. Head-to-head run differential
      if (rec) {
        const hDiff = rec.rf - rec.ra;
        if (hDiff !== 0) return hDiff > 0 ? -1 : 1;
      }
      // 4. Coin flip (stable per pair, so standings don't flicker between renders)
      return pairCoinFlip(a.id, b.id) ? -1 : 1;
    });
  const leader = activeArr[0];
  activeArr.forEach((t, i) => {
    t.rank = i + 1;
    t.gb = leader ? ((leader.w - t.w) + (t.l - leader.l)) / 2 : 0;
  });
  return { all: fullArr, active: activeArr };
}

function computeRemaining(season) {
  const rem = {};
  (season.games || []).forEach(g => {
    if (g.played || g.isPlayoff) return;
    if (g.homeTeamId) rem[g.homeTeamId] = (rem[g.homeTeamId] || 0) + 1;
    if (g.awayTeamId) rem[g.awayTeamId] = (rem[g.awayTeamId] || 0) + 1;
  });
  return rem;
}

// The highest position a team could mathematically still finish in — win
// every remaining game, and see how many teams are still unreachable. A team
// is "locked ahead" if its CURRENT win total alone already exceeds our win
// ceiling — that's guaranteed true regardless of anything else that happens
// the rest of the season, so it's a sound bound (not the common but shakier
// "assume everyone else loses out" shortcut, which isn't always a jointly
// achievable scenario since two teams playing each other can't both lose).
function computeBestPossibleFinish(standings, teamId, remainingByTeam) {
  const t = standings.find(x => x.id === teamId);
  if (!t) return null;
  const remaining = remainingByTeam[t.id] || 0;
  const maxWins = t.w + remaining;
  const others = standings.filter(x => x.id !== t.id);
  const lockedAhead = others.filter(o => o.w > maxWins);
  const catchable = others.filter(o => o.w <= maxWins).sort((a, b) => b.w - a.w);
  const bestRank = 1 + lockedAhead.length;
  return { maxWins, remaining, bestRank, currentRank: t.rank, lockedAhead, catchable };
}

// Reorders standings for playoff purposes when using divisional format: each
// division's best team ("division winner") gets a guaranteed top seed
// (ranked among winners by record), and the remaining playoff spots are
// filled by the next-best teams overall regardless of division ("wild
// cards") — the standard convention in leagues like MLB/NHL/NFL. Returns
// ALL teams reordered so `.slice(0, playoffSpots)` downstream still gives
// the correct seeding; falls back to plain overall order otherwise.
function computePlayoffSeeding(standings, settings) {
  const useDivisional = settings.playoffFormat === 'divisional' && standings.some(t => t.divisionId);
  if (!useDivisional) return standings;
  const divisionIds = [...new Set(standings.map(t => t.divisionId).filter(Boolean))];
  const winnerIds = new Set();
  const winners = [];
  divisionIds.forEach(dId => {
    const best = standings.find(t => t.divisionId === dId);
    if (best) { winners.push(best); winnerIds.add(best.id); }
  });
  winners.sort((a, b) => standings.indexOf(a) - standings.indexOf(b));
  const rest = standings.filter(t => !winnerIds.has(t.id));
  return [...winners, ...rest];
}

// Combines divisional/wildcard seeding with a play-in result: the first
// playoffSpots-1 seeds are locked in by regular-season record (and division
// winner status, if applicable), and the final spot goes to whoever won the
// play-in tournament, once it's decided. Falls back to plain seeding if
// play-in is off or hasn't produced a winner yet.
function buildMainBracketSeeds(standings, settings, playInWinnerId) {
  const seeded = computePlayoffSeeding(standings, settings);
  if (!settings.playInTeams || settings.playInTeams < 2 || !playInWinnerId) return seeded;
  const locked = seeded.slice(0, Math.max(0, settings.playoffSpots - 1));
  const winnerTeam = seeded.find(t => t.id === playInWinnerId) || standings.find(t => t.id === playInWinnerId);
  return winnerTeam ? [...locked, winnerTeam] : seeded;
}

// Generalized clinch/elimination math for ANY rank threshold — not just the
// playoff cutoff. Used for the playoff spot itself, but also for "clinch a
// bye" (threshold = number of teams with a bye), "clinch the #1 seed"
// (threshold = 1), or a division title (threshold = 1, scoped to that
// division's own teams).
function computeThresholdClinch(active, threshold, remainingByTeam) {
  const n = active.length;
  const results = {};
  if (threshold >= n || threshold < 1) {
    active.forEach(t => { results[t.id] = { status: 'alive', number: null }; });
    return results;
  }
  const inside = active.slice(0, threshold);
  const outside = active.slice(threshold);
  const bubbleInWins = Math.min(...inside.map(t => t.w));
  const bubbleOutMax = outside.length ? Math.max(...outside.map(t => t.w + (remainingByTeam[t.id] || 0))) : -Infinity;
  inside.forEach(t => {
    const m = Math.max(0, bubbleOutMax - t.w + 1);
    results[t.id] = { status: m <= 0 && outside.length ? 'clinched' : 'alive', number: outside.length ? m : null, remaining: remainingByTeam[t.id] || 0 };
  });
  outside.forEach(t => {
    const rem = remainingByTeam[t.id] || 0;
    const tMax = t.w + rem;
    const e = tMax - bubbleInWins + 1;
    results[t.id] = { status: e <= 0 ? 'eliminated' : 'alive', number: Math.max(0, e), remaining: rem, gap: Math.max(0, bubbleInWins - t.w) };
  });
  return results;
}
function computeClinchElim(active, playoffSpots, remainingByTeam) {
  return computeThresholdClinch(active, playoffSpots, remainingByTeam);
}

// x = clinched a playoff spot, y = clinched the #1 overall seed (no one can even tie
// them), z = mathematically eliminated. A team can carry more than one letter.
// Groups already-sorted overall standings by division, computing each team's
// rank and games-behind relative to its own division leader (not the league
// leader). Filtering an already-sorted array preserves relative order, so
// the first team found per division is genuinely that division's leader.
function computeDivisionGroups(standings, divisions) {
  const groups = (divisions || []).map(d => {
    const teams = standings.filter(t => t.divisionId === d.id);
    const leader = teams[0];
    const withGb = teams.map((t, i) => ({ ...t, divRank: i + 1, divGb: leader ? ((leader.w - t.w) + (t.l - leader.l)) / 2 : 0 }));
    return { division: d, teams: withGb };
  });
  const unassigned = standings.filter(t => !t.divisionId);
  return { groups, unassigned };
}
function computeClinchSymbols(active, playoffSpots, remainingByTeam) {
  const clinchElim = computeClinchElim(active, playoffSpots, remainingByTeam);
  const symbols = {};
  active.forEach(t => { symbols[t.id] = []; });
  if (active.length >= 1) {
    const leader = active[0];
    const othersMax = active.length > 1 ? Math.max(...active.slice(1).map(t => t.w + (remainingByTeam[t.id] || 0))) : -Infinity;
    if (othersMax < leader.w) symbols[leader.id].push('y');
  }
  active.forEach(t => {
    const ce = clinchElim[t.id];
    if (!ce) return;
    if (ce.status === 'clinched') symbols[t.id].push('x');
    if (ce.status === 'eliminated') symbols[t.id].push('z');
  });
  active.forEach(t => { symbols[t.id].sort(); });
  return symbols;
}

// Lighthearted "press conference" flavor quote based on a team's current
// situation — pure fun, not derived from anything the team actually said.
// Deterministic per (team, situation) so it doesn't change on every render,
// only when their circumstances actually change.
function generatePressQuote(t) {
  const pools = {
    win_streak: [
      `"We're just taking it one game at a time — but yeah, this streak feels good."`,
      `"The guys are locked in right now. Nobody wants this to end."`,
      `"We've found something as a team. Just gotta keep our foot on the gas."`,
    ],
    loss_streak: [
      `"It's been a rough stretch, but we're not pointing fingers. We'll figure it out."`,
      `"Every team goes through this. We just have to trust the process."`,
      `"We know what we're capable of. This isn't who we are."`,
    ],
    leader: [
      `"We like where we're at, but there's a long way to go."`,
      `"Nobody's satisfied. First place doesn't mean much this early."`,
    ],
    last_place: [
      `"We're not thinking about the standings. Just trying to win the next one."`,
      `"Nobody in that room is hanging their heads. We keep playing."`,
    ],
    default: [
      `"We're just focused on getting better every day."`,
      `"Nothing fancy to say — just gotta go out and play."`,
      `"Take it game by game. That's really all there is to it."`,
    ],
  };
  let category = 'default';
  if (t.streak.type === 'W' && t.streak.count >= 3) category = 'win_streak';
  else if (t.streak.type === 'L' && t.streak.count >= 3) category = 'loss_streak';
  else if (t.rank === 1) category = 'leader';
  const pool = pools[category];
  const seed = hashStr(`${t.id}-${category}-${t.streak.count}`);
  return pool[seed % pool.length];
}

function nextGameFor(season, teamId) {
  const g = (season.games || []).find(g => !g.played && !g.isPlayoff && (g.homeTeamId === teamId || g.awayTeamId === teamId));
  if (!g) return null;
  const isHome = g.homeTeamId === teamId;
  return { game: g, opponentId: isHome ? g.awayTeamId : g.homeTeamId };
}

// Generalized version of the clinch scenario sentence, parametrized by a
// human-readable label for whatever's being contested ("a playoff spot",
// "a 1st-round bye", "the #1 seed", "the East division") so the same magic-
// number logic can describe any kind of seed threshold, not just making the
// playoffs at all.
function describeSeedScenario(t, ce, rank, threshold, season, teamsById, bubbleTeam, label) {
  if (!ce) return { text: `${t.displayName} — status unavailable.`, color: CHALK_DIM };
  if (ce.status === 'clinched') return { text: `${t.displayName} has clinched ${label}.`, color: WIN };
  if (ce.status === 'eliminated') return { text: `${t.displayName} can no longer secure ${label}.`, color: NEGATIVE };

  const myNext = season && teamsById ? nextGameFor(season, t.id) : null;
  const bubbleNext = bubbleTeam && season && teamsById ? nextGameFor(season, bubbleTeam.id) : null;
  const myOppName = myNext ? (teamsById[myNext.opponentId]?.name || 'their next opponent') : null;
  const bubbleOppName = bubbleNext ? (teamsById[bubbleNext.opponentId]?.name || 'their next opponent') : null;

  if (rank <= threshold) {
    if (ce.number === 1 && bubbleTeam && myNext && bubbleNext) {
      return { text: `${t.displayName} clinches ${label} with a win over ${myOppName}, or a loss by ${bubbleTeam.displayName} to ${bubbleOppName}.`, color: CHALK };
    }
    return ce.number != null
      ? { text: `${t.displayName}'s magic number for ${label} is ${ce.number}${myNext ? ` — next up: ${myOppName}` : ''}.`, color: CHALK }
      : { text: `${t.displayName} is currently positioned for ${label}.`, color: CHALK };
  }
  if (ce.number === 1 && bubbleTeam && myNext && bubbleNext) {
    return { text: `${t.displayName} loses out on ${label} with a loss to ${myOppName}, or a win by ${bubbleTeam.displayName} over ${bubbleOppName}.`, color: CHALK_DIM };
  }
  return {
    text: `${t.displayName} trails the cutoff for ${label} by ${ce.gap} win${ce.gap === 1 ? '' : 's'} with ${ce.remaining} game${ce.remaining === 1 ? '' : 's'} left.`,
    color: CHALK_DIM,
  };
}
function describeClinchElim(t, ce, rank, playoffSpots, season, teamsById, bubbleTeam) {
  return describeSeedScenario(t, ce, rank, playoffSpots, season, teamsById, bubbleTeam, 'a playoff spot');
}

// Builds the "what needs to happen for X" scenario list beyond just making
// the playoffs at all — the #1 overall seed, a 1st-round bye (however many
// teams the current bracket size actually gives one to), and each division
// title if divisions are set up. Reuses the same magic-number math as the
// basic clinch/elimination watch, just aimed at different rank thresholds.
function computeSeedScenarios(standings, settings, season, teamsById, remainingByTeam) {
  const scenarios = [];
  const n = Math.min(settings.playoffSpots, standings.length);
  if (n < 2) return scenarios;

  // #1 overall seed
  const oneSeedClinch = computeThresholdClinch(standings, 1, remainingByTeam);
  const leader = standings[0], second = standings[1];
  if (leader) {
    if (oneSeedClinch[leader.id] && oneSeedClinch[leader.id].status === 'clinched') {
      scenarios.push({ key: '1seed', group: 'The #1 seed', text: `${leader.displayName} has clinched the #1 seed.`, color: WIN });
    } else if (second) {
      const d = describeSeedScenario(leader, oneSeedClinch[leader.id], 1, 1, season, teamsById, second, 'the #1 seed');
      scenarios.push({ key: '1seed', group: 'The #1 seed', ...d });
    }
  }

  // 1st-round bye(s) — however many the bracket actually hands out given the
  // current playoff-spot count (0 if playoffSpots is already a power of 2).
  const bracketSize = nextPow2(n);
  const byeCount = bracketSize - n;
  if (byeCount > 0 && byeCount < n) {
    const byeClinch = computeThresholdClinch(standings, byeCount, remainingByTeam);
    const bubbleIn = standings[byeCount - 1], bubbleOut = standings[byeCount];
    const label = `a 1st-round bye`;
    if (bubbleIn) {
      if (byeClinch[bubbleIn.id] && byeClinch[bubbleIn.id].status === 'clinched') {
        scenarios.push({ key: 'bye-in', group: '1st-round bye', text: `${bubbleIn.displayName} has clinched ${label}.`, color: WIN });
      } else {
        scenarios.push({ key: 'bye-in', group: '1st-round bye', ...describeSeedScenario(bubbleIn, byeClinch[bubbleIn.id], bubbleIn.rank, byeCount, season, teamsById, bubbleOut, label) });
      }
    }
    if (bubbleOut && byeClinch[bubbleOut.id] && byeClinch[bubbleOut.id].status !== 'eliminated') {
      scenarios.push({ key: 'bye-out', group: '1st-round bye', ...describeSeedScenario(bubbleOut, byeClinch[bubbleOut.id], bubbleOut.rank, byeCount, season, teamsById, bubbleIn, label) });
    }
  }

  // Division titles
  if (season.divisions && season.divisions.length > 0) {
    const { groups } = computeDivisionGroups(standings, season.divisions);
    groups.forEach(g => {
      if (g.teams.length < 2) return;
      const divClinch = computeThresholdClinch(g.teams, 1, remainingByTeam);
      const divLeader = g.teams[0], divSecond = g.teams[1];
      const label = `the ${g.division.name} division`;
      if (divClinch[divLeader.id] && divClinch[divLeader.id].status === 'clinched') {
        scenarios.push({ key: `div-${g.division.id}`, group: g.division.name, text: `${divLeader.displayName} has clinched ${label}.`, color: WIN });
      } else {
        scenarios.push({ key: `div-${g.division.id}`, group: g.division.name, ...describeSeedScenario(divLeader, divClinch[divLeader.id], 1, 1, season, teamsById, divSecond, label) });
      }
    });
  }

  return scenarios;
}

/* ---- rounds ---- */
// Normalizes a round/date label for GROUPING purposes only (so "1", "Round 1",
// "round 1", " R1 " etc. are all treated as the same round instead of splitting
// into separate groups just because they were typed differently).
function roundGroupKey(dateStr, scheduleMode) {
  const s = String(dateStr || '').trim();
  if (!s) return '(unlabeled)';
  if (scheduleMode !== 'round') return s;
  const stripped = s.replace(/^(round|rd|r|week|wk)\.?\s*#?\s*/i, '').trim();
  return (stripped || s).toLowerCase();
}
// Shared comparator so any place that lists a team's games in order (not just
// the round-grouped views) sorts by actual round/date number rather than
// insertion order — a manually-added earlier-round game shouldn't appear
// after later rounds just because it was typed in more recently.
function compareGameDates(aLabel, bLabel, scheduleMode) {
  if (scheduleMode === 'round') {
    const na = parseFloat(String(aLabel).replace(/[^\d.]/g, ''));
    const nb = parseFloat(String(bLabel).replace(/[^\d.]/g, ''));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
  } else {
    const ta = Date.parse(aLabel), tb = Date.parse(bLabel);
    if (!isNaN(ta) && !isNaN(tb)) return ta - tb;
  }
  return String(aLabel || '').localeCompare(String(bLabel || ''), undefined, { numeric: true });
}
function sortGamesChronologically(games, scheduleMode) {
  const regular = games.filter(g => !g.isPlayoff && !g.isPlayIn);
  const playIn = games.filter(g => g.isPlayIn);
  const playoff = games.filter(g => g.isPlayoff);
  const sorted = [...regular].sort((a, b) => compareGameDates(a.date, b.date, scheduleMode));
  return [...sorted, ...playIn, ...playoff];
}
function getOrderedRounds(season) {
  const scheduleMode = (season.settings && season.settings.scheduleMode) || 'date';
  const rounds = [];
  const seen = {};
  (season.games || []).forEach(g => {
    const key = roundGroupKey(g.date, scheduleMode);
    if (!(key in seen)) { seen[key] = { label: g.date || '(unlabeled)', games: [], isPlayoff: !!g.isPlayoff, isPlayIn: !!g.isPlayIn }; rounds.push(seen[key]); }
    seen[key].games.push(g);
  });
  // Sort into real chronological/numeric order instead of "whichever round's
  // first game happened to be entered first" — a manually-added game for an
  // earlier round shouldn't land at the end of the list just because it was
  // typed in later than games from a later round.
  const regular = rounds.filter(r => !r.isPlayoff && !r.isPlayIn);
  const playIn = rounds.filter(r => r.isPlayIn);
  const playoff = rounds.filter(r => r.isPlayoff);
  const sortKey = (r) => {
    if (scheduleMode === 'round') {
      const n = parseFloat(String(r.label).replace(/[^\d.]/g, ''));
      return isNaN(n) ? null : n;
    }
    const t = Date.parse(r.label);
    return isNaN(t) ? null : t;
  };
  regular.sort((a, b) => {
    const ka = sortKey(a), kb = sortKey(b);
    if (ka != null && kb != null) return ka - kb;
    return String(a.label).localeCompare(String(b.label), undefined, { numeric: true });
  });
  return [...regular, ...playIn, ...playoff];
}
// "Current round" = the earliest round that doesn't have every game played
// yet (i.e. the round still in progress or coming up next). If every round
// is fully complete, falls back to the last round.
function currentRoundIndex(rounds) {
  for (let i = 0; i < rounds.length; i++) {
    if (!rounds[i].games.every(g => g.played)) return i;
  }
  return Math.max(0, rounds.length - 1);
}
// The last round with any played game — used for "movement vs. previous round"
// comparisons, which is a different concept from "the round coming up next".
function lastPlayedRoundIndex(rounds) {
  let idx = 0;
  for (let i = 0; i < rounds.length; i++) if (rounds[i].games.some(g => g.played)) idx = i;
  return idx;
}
function computeStandingsThroughRound(season, teamsById, rounds, roundIdx) {
  const gamesUpTo = [];
  for (let i = 0; i <= roundIdx && i < rounds.length; i++) gamesUpTo.push(...rounds[i].games);
  return computeStandings({ ...season, games: gamesUpTo }, teamsById);
}
function computeRoundHistory(season, teamsById, rounds) {
  const snapshots = [];
  const cum = [];
  rounds.forEach(r => {
    cum.push(...r.games);
    const standings = computeStandings({ ...season, games: cum }, teamsById);
    snapshots.push({ label: r.label, standings: standings.active });
  });
  return snapshots;
}
function computeScoringTrend(rounds) {
  return rounds.map(r => {
    const played = r.games.filter(g => g.played);
    const avg = played.length ? played.reduce((s, g) => s + Number(g.homeScore) + Number(g.awayScore), 0) / played.length : null;
    return { label: r.label, avgRuns: avg };
  }).filter(r => r.avgRuns != null);
}

/* ---- extras ---- */

/* ---- extras ---- */
// Scans every season in the league for all-time bests — a "records book" that
// nothing else in the app aggregates across seasons like this.
// Builds a shareable plain-text recap of the season so far — champion (if
// decided), the current/final leader, and the standout notable games —
// reusing data already computed elsewhere rather than anything new.
function buildSeasonRecapText(season, standings, extras, teamsById) {
  const lines = [`🏆 ${season.name} Recap`, ''];
  if (season.championTeamId) {
    const champ = teamsById[season.championTeamId];
    lines.push(`Champion: ${champ ? champ.name : 'Unknown'}`);
  }
  const leader = standings[0];
  if (leader) lines.push(`Regular season leader: ${leader.displayName} (${leader.w}-${leader.l})`);
  lines.push('');
  if (extras) {
    if (extras.highest) lines.push(`Highest scoring game: ${extras.highest.awayName} ${extras.highest.awayScore} @ ${extras.highest.homeName} ${extras.highest.homeScore}`);
    if (extras.biggestBlowout) lines.push(`Biggest blowout: ${extras.biggestBlowout.awayName} ${extras.biggestBlowout.awayScore} @ ${extras.biggestBlowout.homeName} ${extras.biggestBlowout.homeScore} (won by ${extras.biggestBlowout.margin})`);
    if (extras.upsets && extras.upsets[0]) lines.push(`Upset of the season: #${extras.upsets[0].winnerRank} ${extras.upsets[0].winnerName} over #${extras.upsets[0].loserRank} ${extras.upsets[0].loserName}`);
    if (extras.sweeps && extras.sweeps[0]) lines.push(`Season sweep: ${extras.sweeps[0].winnerName} went ${extras.sweeps[0].count}-0 vs ${extras.sweeps[0].loserName}`);
    lines.push('');
    lines.push(`${extras.totalGames} games played, ${extras.oneRunCount} decided by 1 run.`);
  }
  return lines.join('\n');
}

function computeLeagueRecords(league, teamsById) {
  if (!league || !league.seasons || league.seasons.length === 0) return null;
  let bestRecord = null, bestRunDiff = null, longestStreak = null, highestScore = null;
  league.seasons.forEach(s => {
    const st = computeStandings(s, teamsById).active;
    st.forEach(t => {
      if (t.gp > 0 && (!bestRecord || t.pct > bestRecord.pct)) bestRecord = { teamName: t.displayName, seasonName: s.name, w: t.w, l: t.l, pct: t.pct };
      if (!bestRunDiff || t.diff > bestRunDiff.diff) bestRunDiff = { teamName: t.displayName, seasonName: s.name, diff: t.diff };
      if (!longestStreak || t.longestWinStreak > longestStreak.count) longestStreak = { teamName: t.displayName, seasonName: s.name, count: t.longestWinStreak };
    });
    (s.games || []).filter(g => g.played && !g.isForfeit && g.homeTeamId && g.awayTeamId).forEach(g => {
      const homeHigher = Number(g.homeScore) >= Number(g.awayScore);
      const top = homeHigher ? Number(g.homeScore) : Number(g.awayScore);
      const teamId = homeHigher ? g.homeTeamId : g.awayTeamId;
      if (!highestScore || top > highestScore.score) highestScore = { score: top, teamName: (teamsById[teamId] && teamsById[teamId].name) || 'Unknown', seasonName: s.name };
    });
  });
  if (!bestRecord && !bestRunDiff && !longestStreak && !highestScore) return null;
  return { bestRecord, bestRunDiff, longestStreak, highestScore };
}

// Finds the single game with the biggest standings impact — the winning
// team's games-behind-the-leader improved more from this one result than
// from any other game all season. Recomputes standings before/after every
// played game in chronological order, so cost scales with schedule size.
function computeTurningPoint(season, teamsById) {
  const scheduleMode = (season.settings && season.settings.scheduleMode) || 'date';
  const played = sortGamesChronologically((season.games || []).filter(g => g.played && !g.isPlayoff && !g.isPlayIn && !g.isForfeit && g.homeTeamId && g.awayTeamId), scheduleMode);
  if (played.length < 2) return null;
  let cum = [];
  let best = null;
  played.forEach(g => {
    const beforeGb = {};
    computeStandings({ ...season, games: cum }, teamsById).active.forEach(t => { beforeGb[t.id] = t.gb; });
    cum = [...cum, g];
    const afterGb = {};
    computeStandings({ ...season, games: cum }, teamsById).active.forEach(t => { afterGb[t.id] = t.gb; });
    const w = gameWinner(g);
    if (!w) return;
    const winnerId = w === 'home' ? g.homeTeamId : g.awayTeamId;
    if (beforeGb[winnerId] == null || afterGb[winnerId] == null) return;
    const swing = beforeGb[winnerId] - afterGb[winnerId];
    if (swing > 0 && (!best || swing > best.swing)) {
      best = { game: g, swing, winnerName: (teamsById[winnerId] || {}).name || 'Unknown', beforeGb: beforeGb[winnerId], afterGb: afterGb[winnerId] };
    }
  });
  return best;
}

function computeExtras(season, teamsById) {
  const played = (season.games || []).filter(g => g.played && g.homeTeamId && g.awayTeamId);
  if (played.length === 0) return null;
  const nameFor = (id, fallback) => (teamsById[id] ? teamsById[id].name : fallback);
  const withMeta = played.map(g => ({
    ...g,
    total: Number(g.homeScore) + Number(g.awayScore),
    margin: Math.abs(Number(g.homeScore) - Number(g.awayScore)),
    awayName: nameFor(g.awayTeamId, g.awayScheduleName),
    homeName: nameFor(g.homeTeamId, g.homeScheduleName),
  }));
  const std = (season.settings && season.settings.standardInnings) || 7;
  const notable = withMeta.filter(g => !g.isForfeit); // forfeits shouldn't count as "notable" blowouts/records
  const byTotalDesc = [...notable].sort((a, b) => b.total - a.total);
  const byTotalAsc = [...notable].sort((a, b) => a.total - b.total);
  const byInningsDesc = [...notable].sort((a, b) => (b.innings || std) - (a.innings || std));
  const byInningsAsc = [...notable].sort((a, b) => (a.innings || std) - (b.innings || std));
  const byMarginDesc = [...notable].sort((a, b) => b.margin - a.margin);
  const closest = notable.filter(g => g.margin <= 1).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const bestSingleTeamGames = notable.map(g => {
    const homeHigher = Number(g.homeScore) >= Number(g.awayScore);
    return { ...g, topScore: Math.max(Number(g.homeScore), Number(g.awayScore)), topTeamName: homeHigher ? g.homeName : g.awayName };
  }).sort((a, b) => b.topScore - a.topScore);
  const highestSingleTeamScore = bestSingleTeamGames[0] || null;
  // Season sweeps: one team went a perfect X-0 against another this season.
  const h2hCounts = {};
  notable.forEach(g => {
    const w = gameWinner(g);
    if (!w) return;
    const winnerId = w === 'home' ? g.homeTeamId : g.awayTeamId, loserId = w === 'home' ? g.awayTeamId : g.homeTeamId;
    const key = [winnerId, loserId].sort().join('|');
    if (!h2hCounts[key]) h2hCounts[key] = {};
    h2hCounts[key][winnerId] = (h2hCounts[key][winnerId] || 0) + 1;
  });
  const sweeps = [];
  Object.entries(h2hCounts).forEach(([key, wins]) => {
    const ids = Object.keys(wins);
    if (ids.length === 1 && wins[ids[0]] >= 2) {
      const [aId, bId] = key.split('|');
      const winnerId = ids[0], loserId = winnerId === aId ? bId : aId;
      sweeps.push({ winnerName: nameFor(winnerId, 'Unknown'), loserName: nameFor(loserId, 'Unknown'), count: wins[winnerId] });
    }
  });
  // Upset alerts: a team ranked significantly worse (by final standings) beat
  // a much better-ranked opponent. Uses final rank as a stand-in for "how
  // good was this team" — not a perfect historical snapshot, but a fun signal.
  const rankById = {};
  computeStandings(season, teamsById).active.forEach(t => { rankById[t.id] = t.rank; });
  const upsets = notable.map(g => {
    const w = gameWinner(g);
    if (!w) return null;
    const winnerId = w === 'home' ? g.homeTeamId : g.awayTeamId, loserId = w === 'home' ? g.awayTeamId : g.homeTeamId;
    const winnerRank = rankById[winnerId], loserRank = rankById[loserId];
    if (winnerRank == null || loserRank == null) return null;
    const gap = winnerRank - loserRank;
    if (gap < 3) return null;
    return { ...g, gap, winnerName: nameFor(winnerId, 'Unknown'), loserName: nameFor(loserId, 'Unknown'), winnerRank, loserRank };
  }).filter(Boolean).sort((a, b) => b.gap - a.gap);
  // Rivalry index: among pairs who've played at least twice, whoever has the
  // most even head-to-head split (closest to a 50/50 series) and the most
  // meetings is the league's most competitive rivalry.
  const pairGames = {};
  notable.forEach(g => {
    const key = [g.homeTeamId, g.awayTeamId].sort().join('|');
    if (!pairGames[key]) pairGames[key] = { ids: [g.homeTeamId, g.awayTeamId].sort(), count: 0, winsA: 0, winsB: 0, totalMargin: 0 };
    const p = pairGames[key];
    p.count++; p.totalMargin += g.margin;
    const w = gameWinner(g);
    if (w) { const winnerId = w === 'home' ? g.homeTeamId : g.awayTeamId; if (winnerId === p.ids[0]) p.winsA++; else p.winsB++; }
  });
  const rivalryRanked = Object.values(pairGames).filter(p => p.count >= 2).map(p => ({
    nameA: nameFor(p.ids[0], 'Unknown'), nameB: nameFor(p.ids[1], 'Unknown'),
    count: p.count, winsA: p.winsA, winsB: p.winsB,
    competitiveness: 1 - Math.abs(p.winsA - p.winsB) / p.count,
    avgMargin: p.totalMargin / p.count,
  })).sort((a, b) => b.competitiveness - a.competitiveness || b.count - a.count || a.avgMargin - b.avgMargin);

  return {
    highest: byTotalDesc[0] || null, lowest: byTotalAsc[0] || null,
    longest: byInningsDesc[0] || null, shortest: byInningsAsc[0] || null,
    biggestBlowout: byMarginDesc[0] || null,
    highestSingleTeamScore,
    sweeps: sweeps.sort((a, b) => b.count - a.count).slice(0, 8),
    upsets: upsets.slice(0, 8),
    rivalries: rivalryRanked.slice(0, 5),
    oneRunCount: notable.filter(g => g.margin === 1).length,
    xInnCount: notable.filter(g => (g.innings || std) > std).length,
    forfeitCount: withMeta.filter(g => g.isForfeit).length,
    totalGames: played.length,
    closest: closest.slice(0, 12),
  };
}

/* ---- simulation ---- */
// Fills in a single random result for every remaining regular-season game
// (using the same win-probability model as everything else) and returns the
// resulting hypothetical final standings — a quick "what might happen"
// preview, not a saved result and not the same as the full Monte Carlo odds.
function simulateRestOfSeasonOnce(season, teamsById, h2hMatrix) {
  const standings = computeStandings(season, teamsById).active;
  const byId = {};
  standings.forEach(t => { byId[t.id] = t; });
  const simGames = (season.games || []).map(g => {
    if (g.played || g.isPlayoff || g.isPlayIn || !g.homeTeamId || !g.awayTeamId) return g;
    const home = byId[g.homeTeamId], away = byId[g.awayTeamId];
    if (!home || !away) return g;
    const h2h = h2hRecord(h2hMatrix, home.id, away.id);
    const pHome = winProb(home, away, h2h);
    const homeWins = Math.random() < pHome;
    const winnerRuns = 4 + Math.floor(Math.random() * 5);
    const loserRuns = Math.max(0, winnerRuns - 1 - Math.floor(Math.random() * 4));
    return { ...g, played: true, homeScore: homeWins ? winnerRuns : loserRuns, awayScore: homeWins ? loserRuns : winnerRuns };
  });
  return computeStandings({ ...season, games: simGames }, teamsById).active;
}

function runSimulation(season, teamsById, simRuns, playoffSpots, h2hMatrix) {
  const base = computeStandings(season, teamsById).active;
  const remaining = (season.games || []).filter(g => !g.played && !g.isPlayoff && g.homeTeamId && g.awayTeamId
    && base.some(t => t.id === g.homeTeamId) && base.some(t => t.id === g.awayTeamId));
  const n = base.length;
  const results = {};
  base.forEach(t => { results[t.id] = { playoff: 0, seeds: new Array(n).fill(0) }; });
  for (let i = 0; i < simRuns; i++) {
    const sim = {};
    base.forEach(t => { sim[t.id] = { ...t }; });
    for (let gi = 0; gi < remaining.length; gi++) {
      const g = remaining[gi];
      const home = sim[g.homeTeamId], away = sim[g.awayTeamId];
      if (!home || !away) continue;
      const h2h = h2hRecord(h2hMatrix, home.id, away.id);
      const pHome = winProb(home, away, h2h);
      if (Math.random() < pHome) { home.w += 1; away.l += 1; } else { away.w += 1; home.l += 1; }
    }
    const order = Object.values(sim).sort((a, b) => {
      const pa = (a.w + a.l) > 0 ? a.w / (a.w + a.l) : 0;
      const pb = (b.w + b.l) > 0 ? b.w / (b.w + b.l) : 0;
      if (pb !== pa) return pb - pa;
      // 1. Run differential
      const da = a.rf - a.ra, db = b.rf - b.ra;
      if (db !== da) return db - da;
      // 2. Head-to-head record (games actually played so far)
      const rec = h2hMatrix[a.id] && h2hMatrix[a.id][b.id];
      if (rec && (rec.w + rec.l) > 0 && rec.w !== rec.l) return rec.w > rec.l ? -1 : 1;
      // 3. Head-to-head run differential
      if (rec) { const hDiff = rec.rf - rec.ra; if (hDiff !== 0) return hDiff > 0 ? -1 : 1; }
      // 4. Coin flip — genuinely random each trial, which is the statistically correct
      // choice for a Monte Carlo simulation (unlike the real standings, this shouldn't
      // be stable/deterministic, or it would bias thousands of trials toward one team).
      return Math.random() - 0.5;
    });
    order.forEach((t, idx) => {
      results[t.id].seeds[idx] += 1;
      if (idx < playoffSpots) results[t.id].playoff += 1;
    });
  }
  Object.keys(results).forEach(id => {
    results[id].playoffPct = (results[id].playoff / simRuns) * 100;
    results[id].seedPct = results[id].seeds.map(c => (c / simRuns) * 100);
  });
  return results;
}

/* ---- playoff series & bracket simulation (reach round / win championship) ---- */
// Simulates the rest of a single series game-by-game, starting from any partial
// progress already recorded (real games played so far), so it stays accurate if
// the series is already underway. Home-field advantage is a flat win-probability
// nudge applied to whichever team is hosting that specific game.
function simulateSeriesWinner(teamAId, teamBId, teamById, h2hMatrix, seriesLength, homeFieldBoost, startWinsA, startWinsB, higherSeedId) {
  const winsNeeded = seriesWinsNeeded(seriesLength);
  let winsA = startWinsA || 0, winsB = startWinsB || 0;
  let gameNum = winsA + winsB + 1;
  const teamA = teamById[teamAId], teamB = teamById[teamBId];
  if (!teamA || !teamB) return teamAId;
  while (winsA < winsNeeded && winsB < winsNeeded) {
    const aIsHost = (gameNum % 2 === 1) ? (higherSeedId === teamAId) : (higherSeedId !== teamAId);
    const h2h = h2hRecord(h2hMatrix, teamAId, teamBId);
    let pA = winProb(teamA, teamB, h2h);
    const boost = (homeFieldBoost || 0) / 100;
    pA = aIsHost ? Math.min(0.97, Math.max(0.03, pA + boost)) : Math.min(0.97, Math.max(0.03, pA - boost));
    if (Math.random() < pA) winsA++; else winsB++;
    gameNum++;
  }
  return winsA >= winsNeeded ? teamAId : teamBId;
}

// Monte Carlo odds for ONE specific series (not the whole bracket) — used to
// show a live "chance to win this series" percentage on an in-progress
// matchup, properly simulating out the actual number of remaining games in
// that series (best-of-1/3/5/7, whatever the round is configured for) rather
// than just a single-game win probability.
function simulateSeriesOdds(teamAId, teamBId, teamById, h2hMatrix, seriesLength, homeFieldBoost, startWinsA, startWinsB, higherSeedId, trials) {
  let aWins = 0;
  const n = trials || 400;
  for (let i = 0; i < n; i++) {
    if (simulateSeriesWinner(teamAId, teamBId, teamById, h2hMatrix, seriesLength, homeFieldBoost, startWinsA, startWinsB, higherSeedId) === teamAId) aWins++;
  }
  return (aWins / n) * 100;
}

// Reads the real playoff games (if any) into per-slot progress so simulated
// brackets resume from the actual current state instead of always starting fresh.
function buildExistingSeriesBySlot(existingPlayoffGames) {
  const map = {};
  (existingPlayoffGames || []).forEach(g => {
    const key = `${g.playoffRound}-${g.bracketSlot}`;
    if (!map[key]) map[key] = [];
    map[key].push(g);
  });
  const result = {};
  Object.keys(map).forEach(key => {
    const games = map[key];
    const teamIds = new Set();
    games.forEach(g => { if (g.homeTeamId) teamIds.add(g.homeTeamId); if (g.awayTeamId) teamIds.add(g.awayTeamId); });
    const wins = {};
    [...teamIds].forEach(id => { wins[id] = 0; });
    games.forEach(g => {
      if (!g.played) return;
      const w = gameWinner(g);
      const wid = w === 'home' ? g.homeTeamId : w === 'away' ? g.awayTeamId : null;
      if (wid != null) wins[wid] = (wins[wid] || 0) + 1;
    });
    result[key] = { teamIds: [...teamIds], wins, higherSeedId: games[0].higherSeedId || games[0].homeTeamId };
  });
  return result;
}
// Same idea as buildExistingSeriesBySlot, but keyed by (round, team pair)
// instead of (round, bracket slot) — needed for round 2+ once reseeding is on,
// since which "slot" a matchup lands in can shift from what the real bracket
// recorded it as, but the pair of teams involved is always a reliable key.
function buildExistingSeriesByTeamPair(existingPlayoffGames) {
  const byRoundPair = {};
  (existingPlayoffGames || []).forEach(g => {
    const teamIds = [g.homeTeamId, g.awayTeamId].filter(Boolean).sort();
    if (teamIds.length < 2) return;
    const key = `${g.playoffRound}-${teamIds.join('|')}`;
    if (!byRoundPair[key]) byRoundPair[key] = [];
    byRoundPair[key].push(g);
  });
  const result = {};
  Object.keys(byRoundPair).forEach(key => {
    const games = byRoundPair[key];
    const teamIds = new Set();
    games.forEach(g => { if (g.homeTeamId) teamIds.add(g.homeTeamId); if (g.awayTeamId) teamIds.add(g.awayTeamId); });
    const wins = {};
    [...teamIds].forEach(id => { wins[id] = 0; });
    games.forEach(g => {
      if (!g.played) return;
      const w = gameWinner(g);
      const wid = w === 'home' ? g.homeTeamId : w === 'away' ? g.awayTeamId : null;
      if (wid != null) wins[wid] = (wins[wid] || 0) + 1;
    });
    result[key] = { teamIds: [...teamIds], wins, higherSeedId: games[0].higherSeedId || games[0].homeTeamId };
  });
  return result;
}

// Simulates the whole playoff bracket many times (resuming from real results where
// the actual playoffs have already started) and tallies, per team, the percent
// chance of reaching each round and of winning the championship.
function simulatePlayoffs(standings, playoffSpots, settings, h2hMatrix, simRuns, homeFieldBoost, existingPlayoffGames) {
  const n = Math.min(playoffSpots, standings.length);
  if (n < 2) return null;
  const bracketSize = nextPow2(n);
  const order = seedOrder(bracketSize);
  const roundsCount = Math.log2(bracketSize);
  const teamById = {};
  standings.forEach(t => { teamById[t.id] = t; });
  const seedById = {};
  standings.forEach((t, i) => { seedById[t.id] = i + 1; });
  const existingBySlot = buildExistingSeriesBySlot(existingPlayoffGames);
  const existingByPair = buildExistingSeriesByTeamPair(existingPlayoffGames);
  const results = {};
  standings.slice(0, n).forEach(t => { results[t.id] = { reach: new Array(roundsCount + 1).fill(0), champion: 0 }; });

  for (let trial = 0; trial < simRuns; trial++) {
    let survivors = [];
    for (let i = 0; i < order.length; i += 2) {
      const s1 = order[i], s2 = order[i + 1];
      const t1 = s1 <= n ? standings[s1 - 1].id : null;
      const t2 = s2 <= n ? standings[s2 - 1].id : null;
      if (t1 && t2) {
        const key = `1-${i / 2}`;
        const existing = existingBySlot[key];
        let startA = 0, startB = 0, higherSeedId = t1;
        if (existing && existing.teamIds.includes(t1) && existing.teamIds.includes(t2)) {
          startA = existing.wins[t1] || 0; startB = existing.wins[t2] || 0; higherSeedId = existing.higherSeedId;
        }
        const winner = simulateSeriesWinner(t1, t2, teamById, h2hMatrix, getSeriesLength(settings, 1), homeFieldBoost, startA, startB, higherSeedId);
        survivors.push(winner);
        [t1, t2].forEach(id => { if (results[id]) results[id].reach[1] += 1; });
      } else {
        const only = t1 || t2;
        survivors.push(only);
        if (only && results[only]) results[only].reach[1] += 1;
      }
    }
    let round = 2;
    while (survivors.length > 1) {
      if (settings.reseedPlayoffs) {
        survivors = [...survivors].sort((a, b) => (seedById[a] ?? 999) - (seedById[b] ?? 999));
        const paired = [];
        for (let i = 0, j = survivors.length - 1; i < j; i++, j--) paired.push(survivors[i], survivors[j]);
        survivors = paired;
      }
      const next = [];
      for (let i = 0; i < survivors.length; i += 2) {
        const a = survivors[i], b = survivors[i + 1];
        [a, b].forEach(id => { if (results[id]) results[id].reach[round] += 1; });
        // Team-pair lookup (not slot-based) since reseeding can change which
        // "slot" a matchup lands in from what the real bracket recorded.
        const pairKey = `${round}-${[a, b].sort().join('|')}`;
        const existing = existingByPair[pairKey];
        let startA = 0, startB = 0, higherSeedId = a;
        if (existing && existing.teamIds.includes(a) && existing.teamIds.includes(b)) {
          startA = existing.wins[a] || 0; startB = existing.wins[b] || 0; higherSeedId = existing.higherSeedId;
        }
        const winner = simulateSeriesWinner(a, b, teamById, h2hMatrix, getSeriesLength(settings, round), homeFieldBoost, startA, startB, higherSeedId);
        next.push(winner);
      }
      survivors = next;
      round++;
    }
    if (survivors[0] && results[survivors[0]]) results[survivors[0]].champion += 1;
  }
  Object.keys(results).forEach(id => {
    results[id].reachPct = results[id].reach.map(c => (c / simRuns) * 100);
    results[id].championPct = (results[id].champion / simRuns) * 100;
  });
  return { results, roundsCount };
}

/* ---- season "futures" props (dynamic, odds-driven pick'ems) ---- */
// Cheap deterministic PRNG + shuffle so the same round always shows the same
// selection until the round actually advances, but different rounds get a
// genuinely different set — no external random-seed library needed.
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed || 1;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Builds every candidate future question the current state supports, each
// with a STABLE id (so a pick sticks even if the same question resurfaces in
// a later round) and a freshly computed probability. Filters out anything
// already essentially decided (>98% or <2%) since those aren't real bets.
// Odds range every future must fall within to even be considered — keeps
// things feeling like genuine toss-ups rather than "will the obvious thing
// happen" (a near-100% or near-0% question isn't a real bet).
const FUTURES_MIN_PCT = 15, FUTURES_MAX_PCT = 85;
function inFuturesRange(pct) { return pct >= FUTURES_MIN_PCT && pct <= FUTURES_MAX_PCT; }

function computeFuturesPool(season, standings, settings, seasonSim, playoffSim, h2hMatrix) {
  const n = standings.length;
  const pool = [];
  if (!seasonSim || n < 2) return pool;
  const halfN = Math.ceil(n / 2);
  const thresholds = [...new Set([1, 2, 3, halfN, settings.playoffSpots, settings.playoffSpots + 1])].filter(v => v >= 1 && v < n);
  const byId = {}; standings.forEach(t => { byId[t.id] = t; });
  const remaining = (season.games || []).filter(g => !g.played && !g.isPlayoff && !g.isPlayIn && g.homeTeamId && g.awayTeamId);
  const nextGameFor = (teamId) => remaining.find(g => g.homeTeamId === teamId || g.awayTeamId === teamId);

  standings.forEach(t => {
    const sim = seasonSim[t.id];
    if (!sim) return;
    thresholds.forEach(N => {
      const pct = sim.seedPct.slice(0, N).reduce((s, v) => s + v, 0);
      if (inFuturesRange(pct)) {
        const label = N === 1 ? 'finish in 1st place' : `finish in the top ${N}`;
        pool.push({ id: `top${N}-${t.id}`, text: `Will ${t.displayName} ${label}?`, pct, category: 'finish' });
      }
    });
    if (inFuturesRange(sim.playoffPct)) {
      pool.push({ id: `playoff-${t.id}`, text: `Will ${t.displayName} make the playoffs?`, pct: sim.playoffPct, category: 'playoffs' });
    }

    // Next-game / streak-driven props — genuinely different in character from
    // the season-long projections above, and often the most "alive" ones
    // since they hinge on the very next game rather than the whole rest of
    // the season.
    const ng = nextGameFor(t.id);
    if (ng) {
      const isHome = ng.homeTeamId === t.id;
      const oppId = isHome ? ng.awayTeamId : ng.homeTeamId;
      const opp = byId[oppId];
      if (opp) {
        const h2h = h2hRecord(h2hMatrix, isHome ? t.id : opp.id, isHome ? opp.id : t.id);
        const pHomeSide = winProb(isHome ? t : opp, isHome ? opp : t, h2h);
        const myWinPct = (isHome ? pHomeSide : 1 - pHomeSide) * 100;
        if (inFuturesRange(myWinPct)) {
          pool.push({ id: `nextwin-${t.id}`, text: `Will ${t.displayName} win their next game?`, pct: myWinPct, category: 'nextgame' });
        }
        if (t.streak.type === 'L' && t.streak.count >= 3 && inFuturesRange(myWinPct)) {
          pool.push({ id: `snapstreak-${t.id}`, text: `Will ${t.displayName} snap their ${t.streak.count}-game losing streak in their next game?`, pct: myWinPct, category: 'streak' });
        }
        if (t.streak.type === 'W' && t.streak.count >= 3 && inFuturesRange(myWinPct)) {
          pool.push({ id: `extendstreak-${t.id}`, text: `Will ${t.displayName} extend their ${t.streak.count}-game winning streak?`, pct: myWinPct, category: 'streak' });
        }
      }
    }
  });

  // Season-series sweep props: a team currently undefeated (or unbeaten) in
  // an ongoing series with at least one game left against that opponent.
  for (let i = 0; i < standings.length; i++) {
    for (let j = 0; j < standings.length; j++) {
      if (i === j) continue;
      const a = standings[i], b = standings[j];
      const h2h = h2hRecord(h2hMatrix, a.id, b.id);
      if (h2h.aWins < 1 || h2h.aLosses > 0) continue;
      const gamesLeft = remaining.filter(g => (g.homeTeamId === a.id && g.awayTeamId === b.id) || (g.homeTeamId === b.id && g.awayTeamId === a.id));
      if (gamesLeft.length === 0) continue;
      let pSweepRest = 1;
      gamesLeft.forEach(g => {
        const isHome = g.homeTeamId === a.id;
        const h2hNow = h2hRecord(h2hMatrix, isHome ? a.id : b.id, isHome ? b.id : a.id);
        const pHomeSide = winProb(isHome ? a : b, isHome ? b : a, h2hNow);
        pSweepRest *= (isHome ? pHomeSide : 1 - pHomeSide);
      });
      const pct = pSweepRest * 100;
      if (inFuturesRange(pct)) {
        pool.push({ id: `sweep-${a.id}-${b.id}`, text: `Will ${a.displayName} finish a season sweep of ${b.displayName}?`, pct, category: 'sweep' });
      }
    }
  }

  if (playoffSim) {
    standings.slice(0, settings.playoffSpots).forEach(t => {
      const r = playoffSim.results[t.id];
      if (r && inFuturesRange(r.championPct)) {
        pool.push({ id: `champ-${t.id}`, text: `Will ${t.displayName} win the championship?`, pct: r.championPct, category: 'champion' });
      }
    });
    const top2Ids = new Set(standings.slice(0, 2).map(t => t.id));
    const topHalfPlayoffIds = new Set(standings.slice(0, Math.max(1, Math.ceil(settings.playoffSpots / 2))).map(t => t.id));
    let top2ChampPct = 0, topHalfChampPct = 0;
    Object.entries(playoffSim.results).forEach(([id, r]) => {
      if (top2Ids.has(id)) top2ChampPct += r.championPct;
      if (topHalfPlayoffIds.has(id)) topHalfChampPct += r.championPct;
    });
    if (inFuturesRange(top2ChampPct)) pool.push({ id: 'champTop2Seed', text: 'Will the champion be one of the top 2 teams?', pct: top2ChampPct, category: 'champion' });
    if (inFuturesRange(topHalfChampPct)) pool.push({ id: 'champTopHalfSeed', text: 'Will the champion be a top-half playoff seed?', pct: topHalfChampPct, category: 'champion' });
    const underdogPct = 100 - topHalfChampPct;
    if (inFuturesRange(underdogPct)) pool.push({ id: 'champUnderdog', text: 'Will a bottom-half seed pull off the title?', pct: underdogPct, category: 'champion' });
    if (season.divisions && season.divisions.length > 1) {
      season.divisions.forEach(d => {
        let divChampPct = 0;
        standings.forEach(t => { if (t.divisionId === d.id && playoffSim.results[t.id]) divChampPct += playoffSim.results[t.id].championPct; });
        if (inFuturesRange(divChampPct)) pool.push({ id: `champDiv-${d.id}`, text: `Will the champion come from the ${d.name} division?`, pct: divChampPct, category: 'champion' });
      });
    }
  }

  // Team-vs-team "who finishes ahead" props for standings-adjacent pairs,
  // approximated from each team's independent seed distribution.
  for (let i = 0; i < standings.length - 1; i++) {
    const a = standings[i], b = standings[i + 1];
    const simA = seasonSim[a.id], simB = seasonSim[b.id];
    if (!simA || !simB) continue;
    let pAheadOfB = 0;
    for (let si = 0; si < simA.seedPct.length; si++) {
      for (let sj = si + 1; sj < simB.seedPct.length; sj++) pAheadOfB += (simA.seedPct[si] / 100) * (simB.seedPct[sj] / 100);
    }
    const normA = simA.seedPct.reduce((s, v) => s + v, 0) / 100, normB = simB.seedPct.reduce((s, v) => s + v, 0) / 100;
    const norm = normA * normB;
    const pct = norm > 0 ? Math.min(99, Math.max(1, (pAheadOfB / norm) * 100)) : 50;
    if (inFuturesRange(pct)) {
      const ids = [a.id, b.id].sort();
      pool.push({ id: `ahead-${ids[0]}-${ids[1]}`, text: `Will ${a.displayName} finish ahead of ${b.displayName}?`, pct, category: 'headtohead' });
    }
  }
  return pool;
}
// Picks a stable-per-round subset from the pool, capping how many "finish in
// the top N" questions can appear together (they're the easiest category to
// generate in bulk, so left unchecked they'd crowd out everything else).
function selectRoundFutures(pool, seasonId, roundLabel, count, nonce, maxPerCategory) {
  const seed = hashStr(`${seasonId}-${roundLabel}-${nonce || 0}`);
  const shuffled = seededShuffle(pool, seed);
  const picked = [];
  const categoryCounts = {};
  // Cap EVERY category, not just "finish" — otherwise a pool that happens to
  // be full of "next game" questions (common, since there's roughly one per
  // team with an upcoming game) can fill the whole set on its own.
  const cap = maxPerCategory != null ? maxPerCategory : 2;
  for (const f of shuffled) {
    if (picked.length >= count) break;
    const cur = categoryCounts[f.category] || 0;
    if (cur >= cap) continue;
    picked.push(f);
    categoryCounts[f.category] = cur + 1;
  }
  // Backfill if category caps left us short (e.g. a tiny pool with very few categories represented)
  if (picked.length < count) {
    for (const f of shuffled) {
      if (picked.length >= count) break;
      if (!picked.includes(f)) picked.push(f);
    }
  }
  return picked;
}

/* ---- schedule text parsing (supports round/date block headers) ---- */
// Round-robin schedule generator: given a list of teams, produces a full
// schedule where every team plays every other team `rounds` times, using the
// standard "circle method" (fix one team, rotate the rest) so byes/matchups
// are balanced across weeks. Alternates home/away each time two teams meet
// again on a repeat round.
function generateRoundRobinSchedule(teamIds, roundsOfPlay) {
  const ids = [...teamIds];
  const hasBye = ids.length % 2 === 1;
  if (hasBye) ids.push(null); // null = bye slot
  const n = ids.length;
  const half = n / 2;
  const weeks = [];
  let arr = [...ids];
  for (let w = 0; w < n - 1; w++) {
    const pairs = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a != null && b != null) pairs.push([a, b]);
    }
    weeks.push(pairs);
    // rotate all but the first element
    arr = [arr[0], ...arr.slice(-1), ...arr.slice(1, -1)];
  }
  const schedule = [];
  let roundNum = 1;
  for (let rep = 0; rep < Math.max(1, roundsOfPlay); rep++) {
    weeks.forEach(pairs => {
      pairs.forEach(([a, b]) => {
        const flip = rep % 2 === 1; // alternate home/away on repeat rounds
        schedule.push({ round: roundNum, homeTeamId: flip ? b : a, awayTeamId: flip ? a : b });
      });
      roundNum++;
    });
  }
  return schedule;
}

function parseScheduleText(text, mode = 'date') {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const rows = [];
  let currentLabel = '';
  const sepRegexes = [/\s+@\s+/, /\s+at\s+/i, /\s+vs\.?\s+/i, /\s+v\.?\s+/i];
  const tryMatchup = (str) => {
    for (const re of sepRegexes) {
      if (re.test(str)) {
        const parts = str.split(re);
        if (parts.length === 2 && parts[0].trim() && parts[1].trim()) return { away: parts[0].trim(), home: parts[1].trim() };
      }
    }
    return null;
  };
  lines.forEach((line, idx) => {
    let label = currentLabel, away = '', home = '', matched = false, isHeader = false;
    let awayScore = null, homeScore = null, innings = null;

    if (line.includes(',')) {
      const parts = line.split(',').map(p => p.trim()).filter(p => p.length > 0);
      if (parts.length >= 3) {
        label = parts[0]; away = parts[1]; home = parts[2];
        if (parts[3] !== undefined && parts[3] !== '' && !Number.isNaN(Number(parts[3]))) awayScore = Number(parts[3]);
        if (parts[4] !== undefined && parts[4] !== '' && !Number.isNaN(Number(parts[4]))) homeScore = Number(parts[4]);
        if (parts[5] !== undefined && parts[5] !== '' && !Number.isNaN(Number(parts[5]))) innings = Number(parts[5]);
        matched = true;
      }
    }
    if (!matched) {
      // try a matchup directly on this line
      let direct = tryMatchup(line);
      if (direct) { away = direct.away; home = direct.home; label = currentLabel; matched = true; }
      if (!matched) {
        // try stripping a leading date/round prefix on the same line
        let rest = line, prefixLabel = null;
        if (mode === 'round') {
          const rm = rest.match(/^(?:round|rd|r|week|wk)?\.?\s*#?\s*(\d+)\s*[:.\-,]?\s*(.*)$/i);
          if (rm && rm[2]) { prefixLabel = rm[1]; rest = rm[2]; }
        } else {
          const dm = rest.match(/^([A-Za-z]{3,9}\.?\s+\d{1,2}(?:,?\s*\d{2,4})?|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)[\s:,-]+(.*)$/);
          if (dm) { prefixLabel = dm[1]; rest = dm[2]; }
        }
        if (prefixLabel != null) {
          const m2 = tryMatchup(rest);
          if (m2) { away = m2.away; home = m2.home; label = prefixLabel; matched = true; }
        }
      }
      if (!matched) {
        // this line is a standalone header (e.g. "Round 1", "April 5") — applies to following lines
        let headerText = line;
        if (mode === 'round') {
          const hm = headerText.match(/^(?:round|rd|r|week|wk)?\.?\s*#?\s*(\d+)\s*:?\s*$/i);
          headerText = hm ? hm[1] : headerText.replace(/^(round|rd|r|week|wk)\.?\s*/i, '').trim();
        }
        currentLabel = headerText;
        rows.push({ rowId: idx, raw: line, isHeader: true, date: headerText, away: '', home: '', awayScore: null, homeScore: null, innings: null, matched: false });
        return;
      }
    }
    rows.push({ rowId: idx, raw: line, isHeader: false, date: label, away, home, awayScore, homeScore, innings, matched: matched && !!away && !!home });
  });
  return rows;
}

function resizeImageFile(file, maxDim = 160) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('image load failed'));
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) { const scale = maxDim / Math.max(w, h); w = Math.round(w * scale); h = Math.round(h * scale); }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

/* ---- season / league helpers ---- */
function newSeason(name) {
  return { id: uid('season'), name, createdAt: Date.now(), championTeamId: null, settings: { ...DEFAULT_SETTINGS }, members: [], games: [], divisions: [] };
}
function newDivision(name, conference) { return { id: uid('div'), name, conference: conference || '' }; }
function migrateShape(lg) {
  if (lg.seasons) return lg;
  const season = {
    id: uid('season'), name: 'Season 1', createdAt: lg.createdAt || Date.now(), championTeamId: null,
    settings: { ...DEFAULT_SETTINGS, ...(lg.settings || {}) },
    members: (lg.teams || []).map(t => ({ teamId: t.id, scheduleName: t.scheduleName, baselineW: t.baselineW || 0, baselineL: t.baselineL || 0, baselineRF: t.baselineRF || 0, baselineRA: t.baselineRA || 0, active: true })),
    games: lg.games || [],
  };
  return { id: lg.id, name: lg.name, createdAt: lg.createdAt || Date.now(), seasons: [season], activeSeasonId: season.id, _legacyTeams: lg.teams || [] };
}

/* ==================================================================== */
/* Storage helpers                                                       */
/* ==================================================================== */
async function storGet(key, attempt = 0) {
  try {
    const { data, error } = await supabase.from('kv_store').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    return data ? data.value : null;
  } catch (e) {
    if (attempt < 1) return storGet(key, attempt + 1);
    console.error('storage.get failed', key, e);
    return null;
  }
}
async function storSet(key, value, attempt = 0) {
  try {
    const { error } = await supabase.from('kv_store').upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('storage.set failed', key, e);
    if (attempt < 2) { await new Promise(r => setTimeout(r, 250 * (attempt + 1))); return storSet(key, value, attempt + 1); }
    return false;
  }
}
async function storDelete(key) {
  try { const { error } = await supabase.from('kv_store').delete().eq('key', key); if (error) throw error; return true; }
  catch (e) { console.error('storage.delete failed', key, e); return false; }
}

async function loadList(key) { const raw = await storGet(key); if (!raw) return []; try { return JSON.parse(raw); } catch (e) { return []; } }
async function saveList(key, list) { await storSet(key, JSON.stringify(list)); }
async function loadObj(key) { const raw = await storGet(key); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } }
async function saveObj(key, obj) { return storSet(key, JSON.stringify(obj)); }

/* ==================================================================== */
/* Small UI atoms                                                        */
/* ==================================================================== */
function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wide transition-colors flex-shrink-0"
      style={{ minWidth: 54, background: active ? PRIMARY : 'transparent', color: active ? INK : CHALK_DIM }}>
      <Icon size={15} />
      {label}
    </button>
  );
}
function Panel({ children, className = '', style = {} }) {
  return <div className={`rounded-xl border ${className}`} style={{ background: PANEL, borderColor: LINE, ...style }}>{children}</div>;
}
function SectionTitle({ children, right, accent = PRIMARY }) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2 gap-2">
      <h3 className="text-xs font-bold tracking-[0.14em] uppercase" style={{ color: accent }}>{children}</h3>
      {right}
    </div>
  );
}
function NumInput({ value, onChange, w = 'w-14', min, max, step = 1, allowDecimal = false, disabled = false }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => { setDraft(String(value ?? '')); }, [value]);
  const commit = () => {
    let n = allowDecimal ? parseFloat(draft) : parseInt(draft, 10);
    if (Number.isNaN(n)) n = Number(value) || 0;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setDraft(String(n));
    onChange(n);
  };
  return (
    <input type="number" inputMode={allowDecimal ? 'decimal' : 'numeric'} step={step} value={draft} disabled={disabled}
      onChange={e => setDraft(e.target.value)} onFocus={e => e.target.select()} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
      className={`${w} bg-[#222D42] border rounded px-1.5 py-1 text-center text-sm font-mono disabled:opacity-50`}
      style={{ borderColor: LINE, color: CHALK }} />
  );
}
function TeamMark({ team, size = 22 }) {
  const color = teamColor(team);
  if (team.logoUrl) return <img src={team.logoUrl} alt="" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 6, flexShrink: 0, boxShadow: `0 0 0 2px ${color}` }} />;
  if (team.mascot) return <span className="inline-flex items-center justify-center rounded-full flex-shrink-0" style={{ width: size, height: size, background: `${color}22`, boxShadow: `0 0 0 2px ${color}55`, fontSize: Math.round(size * 0.62), lineHeight: 1 }}>{team.mascot}</span>;
  return <span className="inline-block rounded-full flex-shrink-0" style={{ width: Math.round(size * 0.6), height: Math.round(size * 0.6), background: color, boxShadow: `0 0 0 2px ${color}55` }} />;
}
function TeamAccentCell({ team, children, className = '' }) {
  return <td className={className} style={{ borderLeft: `3px solid ${teamColor(team)}` }}>{children}</td>;
}
function StatBox({ label, value, color = CHALK }) {
  return (
    <div className="p-3" style={{ background: PANEL }}>
      <div className="text-[9px] uppercase" style={{ color: CHALK_DIM }}>{label}</div>
      <div className="text-sm font-mono font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
function MoveIndicator({ delta }) {
  if (delta == null || delta === 0) return <span style={{ color: CHALK_DIM }}>–</span>;
  if (delta > 0) return <span style={{ color: WIN }}>▲{delta}</span>;
  return <span style={{ color: NEGATIVE }}>▼{Math.abs(delta)}</span>;
}
function ClinchBadge({ symbol }) {
  const color = symbol === 'z' ? NEGATIVE : symbol === 'y' ? GOLD : WIN;
  return <sup className="font-mono font-bold" style={{ color, fontSize: '10px' }}>{symbol}</sup>;
}

/* ==================================================================== */
/* Bracket ("if the playoffs started today")                             */
/* ==================================================================== */
function MatchRow({ seed, team, bye, placeholder, score, isWinner, isDecided, odds }) {
  const color = team ? teamColor(team) : null;
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs" style={{ background: isWinner ? 'rgba(45,212,191,0.12)' : PANEL2, borderBottom: `1px solid ${LINE}`, borderLeft: color ? `3px solid ${color}` : undefined }}>
      {placeholder ? <span style={{ color: CHALK_DIM }}>TBD</span> : (
        <>
          {seed != null && <span className="font-mono w-4 flex-shrink-0" style={{ color: CHALK_DIM }}>{seed}</span>}
          {team && !bye ? <TeamMark team={team} size={14} /> : null}
          <span className="flex-1 truncate" style={{ color: bye ? CHALK_DIM : (isWinner ? WIN : CHALK) }}>{bye ? 'BYE' : (team ? (team.displayName || team.name || 'TBD') : 'TBD')}</span>
          {odds != null && !bye && <span className="font-mono flex-shrink-0 text-[10px]" style={{ color: odds >= 50 ? WIN : CHALK_DIM }}>{odds.toFixed(0)}%</span>}
          {score != null && !bye && <span className="font-mono flex-shrink-0" style={{ color: isWinner ? WIN : CHALK_DIM }}>{score}</span>}
        </>
      )}
    </div>
  );
}

function SeriesMatchCard({ slotGames, teamsById, winsNeeded, seriesLength, standingsById, h2hMatrix, homeFieldBoost }) {
  if (!slotGames || slotGames.length === 0) return <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}`, opacity: 0.5 }}><MatchRow placeholder /><MatchRow placeholder /></div>;
  if (slotGames.length === 1 && slotGames[0].isBye) {
    const home = teamsById[slotGames[0].homeTeamId];
    return <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}` }}><MatchRow team={home} isWinner /><MatchRow bye /></div>;
  }
  const higherSeedId = slotGames[0].higherSeedId || slotGames[0].homeTeamId;
  const teamIds = new Set();
  slotGames.forEach(g => { if (g.homeTeamId) teamIds.add(g.homeTeamId); if (g.awayTeamId) teamIds.add(g.awayTeamId); });
  const lowerSeedId = [...teamIds].find(id => id !== higherSeedId);
  const wins = {};
  teamIds.forEach(id => { wins[id] = 0; });
  slotGames.forEach(g => {
    if (!g.played) return;
    const w = gameWinner(g);
    const wid = w === 'home' ? g.homeTeamId : w === 'away' ? g.awayTeamId : null;
    if (wid != null) wins[wid] = (wins[wid] || 0) + 1;
  });
  const decided = [...teamIds].find(id => wins[id] >= winsNeeded);
  const higherTeam = teamsById[higherSeedId], lowerTeam = teamsById[lowerSeedId];
  const showSeriesScore = winsNeeded > 1;
  // Live series odds: simulate out the remaining games of THIS series
  // specifically (respecting its actual configured length and current
  // progress), rather than a flat single-game probability.
  let higherOdds = null, lowerOdds = null;
  if (!decided && standingsById && standingsById[higherSeedId] && standingsById[lowerSeedId]) {
    higherOdds = simulateSeriesOdds(higherSeedId, lowerSeedId, standingsById, h2hMatrix, seriesLength, homeFieldBoost, wins[higherSeedId] || 0, wins[lowerSeedId] || 0, higherSeedId, 400);
    lowerOdds = 100 - higherOdds;
  }
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
      <MatchRow team={higherTeam} score={showSeriesScore ? (wins[higherSeedId] || 0) : null} isWinner={decided === higherSeedId} odds={higherOdds} />
      <MatchRow team={lowerTeam} score={showSeriesScore ? (wins[lowerSeedId] || 0) : null} isWinner={decided === lowerSeedId} odds={lowerOdds} />
    </div>
  );
}

function PlayInBracket({ standings, settings, playInGames, teamsById, onStart, onClear, onOpenTeam }) {
  const { isLoggedIn } = useAuth();
  const playInTeams = settings.playInTeams || 0;
  if (playInTeams < 2) return null;
  const hasPlayIn = playInGames.length > 0;
  const bubble = standings.slice(Math.max(0, settings.playoffSpots - 1), Math.max(0, settings.playoffSpots - 1) + playInTeams);
  const bracketSize = nextPow2(bubble.length);
  const roundsCount = bubble.length >= 2 ? Math.log2(bracketSize) : 0;
  const maxRound = hasPlayIn ? Math.max(...playInGames.map(g => g.playInRound)) : 0;
  const winnerId = getPlayInWinner(playInGames);
  const winner = winnerId ? teamsById[winnerId] : null;

  if (bubble.length < 2 && !hasPlayIn) {
    return <Panel><SectionTitle>Play-in tournament</SectionTitle><p className="px-4 pb-4 text-sm" style={{ color: CHALK_DIM }}>Not enough bubble teams yet for a play-in bracket.</p></Panel>;
  }

  return (
    <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
      <SectionTitle accent={GOLD} right={
        !hasPlayIn ? (
          isLoggedIn && <button onClick={onStart} disabled={bubble.length < 2} className="text-[11px] font-bold flex items-center gap-1 disabled:opacity-40" style={{ color: PRIMARY }}><Crown size={12} /> Generate play-in</button>
        ) : (
          isLoggedIn && <button onClick={() => { if (confirm('Clear the play-in bracket? Scores already entered will be lost.')) onClear(); }} className="text-[11px] font-semibold" style={{ color: NEGATIVE }}>Clear play-in</button>
        )
      }>Play-in tournament</SectionTitle>
      {winner && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold" style={{ background: 'rgba(245,198,75,0.12)', color: GOLD }}>
          <Crown size={15} /> {winner.name || winner.displayName} won the play-in and takes the final playoff spot!
        </div>
      )}
      <div className="px-4 pb-2 overflow-x-auto">
        <div className="flex gap-6" style={{ minWidth: roundsCount * 170 }}>
          {Array.from({ length: roundsCount }).map((_, ri) => {
            const round = ri + 1;
            const roundGames = hasPlayIn ? playInGames.filter(g => g.playInRound === round) : [];
            const slotsInRound = bracketSize / Math.pow(2, round);
            return (
              <div key={ri} className="flex flex-col justify-around gap-3 flex-shrink-0" style={{ minWidth: 150 }}>
                <div className="text-[10px] uppercase font-bold mb-1" style={{ color: PRIMARY }}>{round === 1 ? 'Round 1' : `Round ${round}`}</div>
                {round === 1 && !hasPlayIn ? Array.from({ length: slotsInRound }).map((_, idx) => {
                  const s1 = idx * 2 + 1, s2 = idx * 2 + 2;
                  const t1 = s1 <= bubble.length ? bubble[s1 - 1] : null, t2 = s2 <= bubble.length ? bubble[s2 - 1] : null;
                  return (
                    <div key={idx} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
                      <MatchRow seed={settings.playoffSpots + s1 - 1} team={t1} bye={!t1} />
                      <MatchRow seed={t2 ? settings.playoffSpots + s2 - 1 : null} team={t2} bye={!t2} />
                    </div>
                  );
                }) : round <= maxRound ? Array.from({ length: slotsInRound }).map((_, idx) => {
                  const g = roundGames.find(gg => gg.bracketSlot === idx);
                  if (!g) return <div key={idx} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}`, opacity: 0.5 }}><MatchRow placeholder /><MatchRow placeholder /></div>;
                  const home = g.homeTeamId ? teamsById[g.homeTeamId] : null, away = g.awayTeamId ? teamsById[g.awayTeamId] : null;
                  const homeWin = g.played && gameWinner(g) === 'home', awayWin = g.played && gameWinner(g) === 'away';
                  return (
                    <div key={idx} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
                      <MatchRow team={home} score={g.played ? g.homeScore : null} isWinner={homeWin} />
                      <MatchRow team={away} bye={g.isBye} score={g.played && !g.isBye ? g.awayScore : null} isWinner={awayWin} />
                    </div>
                  );
                }) : Array.from({ length: slotsInRound }).map((_, idx) => (
                  <div key={idx} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}`, opacity: 0.5 }}><MatchRow placeholder /><MatchRow placeholder /></div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>
        {hasPlayIn ? 'Score play-in games from the Schedule tab.' : `Seeded from teams ranked #${settings.playoffSpots} through #${settings.playoffSpots + playInTeams - 1} in the standings.`}
      </p>
    </Panel>
  );
}

function BracketView({ standings, settings, playoffGames, teamsById, onStart, onClear, onOpenTeam, h2hMatrix }) {
  const { isLoggedIn } = useAuth();
  const playoffSpots = settings.playoffSpots;
  const n = Math.min(playoffSpots, standings.length);
  const hasPlayoffs = playoffGames.length > 0;
  const roundsCount = n >= 2 ? Math.log2(nextPow2(n)) : 0;
  const standingsById = useMemo(() => { const m = {}; standings.forEach(t => { m[t.id] = t; }); return m; }, [standings]);

  if (n < 2 && !hasPlayoffs) {
    return <Panel><SectionTitle>Playoffs</SectionTitle>
      <p className="px-4 pb-4 text-sm" style={{ color: CHALK_DIM }}>Need at least 2 teams and 2 playoff spots to build a bracket.</p></Panel>;
  }

  let previewRound1 = [];
  if (!hasPlayoffs) {
    const seeds = standings.slice(0, n);
    const bracketSize = nextPow2(n);
    const order = seedOrder(bracketSize);
    for (let i = 0; i < order.length; i += 2) {
      const s1 = order[i], s2 = order[i + 1];
      previewRound1.push({ s1, t1: s1 <= n ? seeds[s1 - 1] : null, s2, t2: s2 <= n ? seeds[s2 - 1] : null });
    }
  }

  const maxGeneratedRound = hasPlayoffs ? Math.max(...playoffGames.map(g => g.playoffRound)) : 0;
  let champion = null;
  if (hasPlayoffs && maxGeneratedRound === roundsCount) {
    const finalWinsNeeded = seriesWinsNeeded(getSeriesLength(settings, roundsCount));
    const finalGames = playoffGames.filter(g => g.playoffRound === roundsCount);
    const teamIds = new Set();
    finalGames.forEach(g => { if (g.homeTeamId) teamIds.add(g.homeTeamId); if (g.awayTeamId) teamIds.add(g.awayTeamId); });
    const wins = {};
    teamIds.forEach(id => { wins[id] = 0; });
    finalGames.forEach(g => {
      if (!g.played) return;
      const w = gameWinner(g);
      const wid = w === 'home' ? g.homeTeamId : w === 'away' ? g.awayTeamId : null;
      if (wid != null) wins[wid] = (wins[wid] || 0) + 1;
    });
    const decidedId = [...teamIds].find(id => wins[id] >= finalWinsNeeded) || (finalGames.length === 1 && finalGames[0].isBye ? finalGames[0].homeTeamId : null);
    if (decidedId) champion = teamsById[decidedId];
  }

  return (
    <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
      <SectionTitle accent={GOLD} right={
        !hasPlayoffs ? (
          isLoggedIn && <button onClick={onStart} disabled={n < 2} className="text-[11px] font-bold flex items-center gap-1 disabled:opacity-40" style={{ color: PRIMARY }}><Crown size={12} /> Generate bracket</button>
        ) : (
          isLoggedIn && <button onClick={() => { if (confirm('Clear the generated playoff bracket? Scores already entered will be lost.')) onClear(); }} className="text-[11px] font-semibold" style={{ color: NEGATIVE }}>Clear bracket</button>
        )
      }>
        {hasPlayoffs ? 'Playoff bracket' : 'If the playoffs started today'}
      </SectionTitle>
      {champion && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold" style={{ background: 'rgba(245,198,75,0.12)', color: GOLD }}>
          <Crown size={15} /> {champion.name} won the playoffs!
        </div>
      )}
      <div className="px-4 pb-2 overflow-x-auto">
        <div className="flex gap-6" style={{ minWidth: roundsCount * 170 }}>
          {Array.from({ length: roundsCount }).map((_, ri) => {
            const round = ri + 1;
            const roundGames = hasPlayoffs ? playoffGames.filter(g => g.playoffRound === round) : [];
            const slotsInRound = nextPow2(n) / Math.pow(2, round);
            return (
              <div key={ri} className="flex flex-col justify-around gap-3 flex-shrink-0" style={{ minWidth: 150 }}>
                <div className="text-[10px] uppercase font-bold mb-1" style={{ color: PRIMARY }}>{(round === 1 ? 'Round 1' : round === roundsCount ? 'Final' : `Round ${round}`)} <span style={{ color: CHALK_DIM, textTransform: 'none' }}>(Bo{getSeriesLength(settings, round)})</span></div>
                {round === 1 && !hasPlayoffs ? previewRound1.map((m, idx) => (
                  <div key={idx} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
                    <MatchRow seed={m.s1} team={m.t1} bye={!m.t1} />
                    <MatchRow seed={m.s2} team={m.t2} bye={!m.t2} />
                  </div>
                )) : round <= maxGeneratedRound
                  ? Array.from({ length: slotsInRound }).map((_, idx) => (
                    <SeriesMatchCard key={idx} slotGames={roundGames.filter(gg => gg.bracketSlot === idx)} teamsById={teamsById} winsNeeded={seriesWinsNeeded(getSeriesLength(settings, round))} seriesLength={getSeriesLength(settings, round)} standingsById={standingsById} h2hMatrix={h2hMatrix} homeFieldBoost={settings.homeFieldBoost || 0} />
                  ))
                  : Array.from({ length: slotsInRound }).map((_, idx) => (
                    <div key={idx} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}`, opacity: 0.5 }}><MatchRow placeholder /><MatchRow placeholder /></div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
      <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>
        {hasPlayoffs
          ? 'Score playoff games from the Schedule tab — later rounds fill in automatically as each round finishes.'
          : `Seeded by current standings (${n} of ${playoffSpots} spot${playoffSpots === 1 ? '' : 's'} filled). Generating locks in the bracket and adds real games to your schedule.`}
      </p>
    </Panel>
  );
}

/* ==================================================================== */
/* Leagues screen                                                        */
/* ==================================================================== */
function LeaguesView({ index, onOpen, onCreate, onDelete, onRename, onRefresh, loadError, onOpenRegistry, onOpenAppearance }) {
  const { isLoggedIn } = useAuth();
  const [newName, setNewName] = useState('');
  const [newSport, setNewSport] = useState('baseball');
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  return (
    <div className="p-4 space-y-4">
      {loadError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(251,113,102,0.12)', color: NEGATIVE, border: `1px solid ${NEGATIVE}` }}>
          <AlertTriangle size={15} /> {loadError}
        </div>
      )}
      <button onClick={onOpenRegistry} className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: PANEL, border: `1px solid ${LINE}`, color: CHALK }}>
        <span className="flex items-center gap-2"><Users size={16} style={{ color: PRIMARY }} /> Manage all teams</span>
        <ChevronRight size={16} style={{ color: CHALK_DIM }} />
      </button>
      <button onClick={onOpenAppearance} className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: PANEL, border: `1px solid ${LINE}`, color: CHALK }}>
        <span className="flex items-center gap-2"><SettingsIcon size={16} style={{ color: PRIMARY }} /> Settings &amp; appearance</span>
        <ChevronRight size={16} style={{ color: CHALK_DIM }} />
      </button>
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY}>Start a new league</SectionTitle>
        <div className="px-4 pb-4 space-y-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Riverside Rec League"
            className="w-full bg-[#222D42] border rounded px-3 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }} />
          <select value={newSport} onChange={e => setNewSport(e.target.value)} className="w-full bg-[#222D42] border rounded px-2 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }}>
            {Object.entries(SPORT_PRESETS).map(([key, s]) => <option style={{ background: PANEL2, color: CHALK }} key={key} value={key}>{s.label}</option>)}
          </select>
          <button onClick={() => { if (newName.trim()) { onCreate(newName.trim(), newSport); setNewName(''); } }} disabled={!isLoggedIn}
            className="w-full px-3 py-2 rounded font-bold text-sm flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: PRIMARY, color: INK }}>
            <Plus size={16} /> Create
          </button>
        </div>
      </Panel>
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY} right={<button onClick={onRefresh} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: CHALK_DIM }}><RefreshCw size={12} /> Refresh</button>}>
          Your leagues
        </SectionTitle>
        <div className="px-2 pb-3">
          {index.length === 0 && <p className="px-2 py-4 text-sm" style={{ color: CHALK_DIM }}>No leagues yet. Create one above to get started.</p>}
          {index.map(l => (
            <div key={l.id} className="flex items-center gap-2 px-2 py-2 rounded-lg" style={{ borderBottom: `1px solid ${LINE}` }}>
              {renamingId === l.id ? (
                <>
                  <input value={renameVal} onChange={e => setRenameVal(e.target.value)} className="flex-1 bg-[#222D42] border rounded px-2 py-1 text-sm" style={{ borderColor: LINE, color: CHALK }} />
                  <button onClick={() => { onRename(l.id, renameVal.trim() || l.name); setRenamingId(null); }} disabled={!isLoggedIn} className="p-1.5 rounded disabled:opacity-50" style={{ color: PRIMARY }}><Check size={16} /></button>
                  <button onClick={() => setRenamingId(null)} className="p-1.5 rounded" style={{ color: CHALK_DIM }}><X size={16} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => onOpen(l.id)} className="flex-1 text-left text-sm font-semibold flex items-center gap-2" style={{ color: CHALK }}>
                    <Folder size={15} style={{ color: PRIMARY }} /> {l.name}
                  </button>
                  {isLoggedIn && <button onClick={() => { setRenamingId(l.id); setRenameVal(l.name); }} className="p-1.5 rounded" style={{ color: CHALK_DIM }}><Pencil size={14} /></button>}
                  {isLoggedIn && <button onClick={() => { if (confirm(`Delete "${l.name}"? This cannot be undone.`)) onDelete(l.id); }} className="p-1.5 rounded" style={{ color: NEGATIVE }}><Trash2 size={14} /></button>}
                  <button onClick={() => onOpen(l.id)} className="p-1.5 rounded" style={{ color: PRIMARY }}><ChevronRight size={16} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ==================================================================== */
/* Global team registry + cross-league history                          */
/* ==================================================================== */
function BrandEditor({ gt, updateGlobalTeamField }) {
  const { isLoggedIn } = useAuth();
  const [busy, setBusy] = useState(null);
  const [showMascots, setShowMascots] = useState(false);
  const MASCOT_EMOJI = ['🦁', '🐯', '🐻', '🦅', '🐺', '🦈', '🐉', '🦂', '🐍', '🦍', '🐘', '🦏', '🐎', '🦬', '🦁', '⚡', '🔥', '⭐', '💀', '👑', '⚔️', '🛡️', '🎯', '🚀'];
  const handleImage = async (field, file) => {
    if (!file) return;
    setBusy(field);
    try {
      const dataUrl = await resizeImageFile(file, field === 'wordmarkUrl' ? 260 : 160);
      if (dataUrl.length > 1_500_000) alert('That image is too large even after resizing — try a smaller file.');
      else updateGlobalTeamField(gt.id, field, dataUrl);
    } catch (e) { alert('Could not read that image file.'); }
    setBusy(null);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 flex-wrap">
        <input type="color" value={gt.color || hashColor(gt.id)} disabled={!isLoggedIn} onChange={e => updateGlobalTeamField(gt.id, 'color', e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed" style={{ border: `1px solid ${LINE}` }} />
        <div className="flex items-center gap-2">
          {gt.logoUrl ? <img src={gt.logoUrl} alt="" className="w-8 h-8 object-contain rounded" style={{ background: PANEL }} /> : <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: PANEL }}><ImageIcon size={14} style={{ color: CHALK_DIM }} /></div>}
          {isLoggedIn && (
            <label className="text-[11px] px-2 py-1 rounded cursor-pointer font-semibold" style={{ background: PANEL, color: PRIMARY, border: `1px solid ${LINE}` }}>
              {busy === 'logoUrl' ? 'Uploading…' : 'Logo'}
              <input type="file" accept="image/*" className="hidden" onChange={e => handleImage('logoUrl', e.target.files[0])} />
            </label>
          )}
          {isLoggedIn && gt.logoUrl && <button onClick={() => updateGlobalTeamField(gt.id, 'logoUrl', null)} className="text-[10px]" style={{ color: CHALK_DIM }}>remove</button>}
        </div>
        <div className="flex items-center gap-2">
          {gt.wordmarkUrl ? <img src={gt.wordmarkUrl} alt="" className="h-8 max-w-[100px] object-contain rounded" style={{ background: PANEL }} /> : <div className="w-14 h-8 rounded flex items-center justify-center" style={{ background: PANEL }}><ImageIcon size={14} style={{ color: CHALK_DIM }} /></div>}
          {isLoggedIn && (
            <label className="text-[11px] px-2 py-1 rounded cursor-pointer font-semibold" style={{ background: PANEL, color: PRIMARY, border: `1px solid ${LINE}` }}>
              {busy === 'wordmarkUrl' ? 'Uploading…' : 'Wordmark'}
              <input type="file" accept="image/*" className="hidden" onChange={e => handleImage('wordmarkUrl', e.target.files[0])} />
            </label>
          )}
          {isLoggedIn && gt.wordmarkUrl && <button onClick={() => updateGlobalTeamField(gt.id, 'wordmarkUrl', null)} className="text-[10px]" style={{ color: CHALK_DIM }}>remove</button>}
        </div>
      </div>
      {!gt.logoUrl && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px]" style={{ color: CHALK_DIM }}>Mascot (used when there's no logo):</span>
          {gt.mascot && <span className="text-lg">{gt.mascot}</span>}
          {isLoggedIn && <button onClick={() => setShowMascots(v => !v)} className="text-[11px] px-2 py-1 rounded font-semibold" style={{ background: PANEL, color: PRIMARY, border: `1px solid ${LINE}` }}>{showMascots ? 'Close' : gt.mascot ? 'Change' : 'Pick one'}</button>}
          {isLoggedIn && gt.mascot && <button onClick={() => updateGlobalTeamField(gt.id, 'mascot', null)} className="text-[10px]" style={{ color: CHALK_DIM }}>remove</button>}
          {isLoggedIn && showMascots && (
            <div className="w-full flex flex-wrap gap-1.5 mt-1">
              {MASCOT_EMOJI.map((e, i) => (
                <button key={i} onClick={() => { updateGlobalTeamField(gt.id, 'mascot', e); setShowMascots(false); }} className="text-lg w-9 h-9 rounded flex items-center justify-center" style={{ background: PANEL, border: `1px solid ${LINE}` }}>{e}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamRegistryView({ teamsIndex, teamsById, onBack, onCreate, onOpenHistory, updateGlobalTeamField }) {
  const { isLoggedIn } = useAuth();
  const [name, setName] = useState('');
  return (
    <div className="p-4 space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: CHALK_DIM }}><ArrowLeft size={14} /> Back</button>
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY}>Create a team</SectionTitle>
        <div className="flex gap-2 px-4 pb-4">
          <input value={name} onChange={e => setName(e.target.value)} disabled={!isLoggedIn} placeholder="Team name" className="flex-1 bg-[#222D42] border rounded px-3 py-2 text-sm disabled:opacity-50" style={{ borderColor: LINE, color: CHALK }} />
          <button onClick={() => { if (name.trim()) { onCreate(name.trim()); setName(''); } }} disabled={!isLoggedIn} className="px-3 py-2 rounded font-bold text-sm flex items-center gap-1 disabled:opacity-50" style={{ background: PRIMARY, color: INK }}>
            <Plus size={16} /> Add
          </button>
        </div>
        <p className="px-4 pb-4 text-xs" style={{ color: CHALK_DIM }}>Teams created here can be added to any season of any league, keep their colors and logos everywhere they're used, and keep one history across all of them.</p>
      </Panel>
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY}>All teams ({teamsIndex.length})</SectionTitle>
        <div className="px-3 pb-3 space-y-3">
          {teamsIndex.length === 0 && <p className="px-1 py-4 text-sm" style={{ color: CHALK_DIM }}>No teams yet.</p>}
          {teamsIndex.map(t => {
            const gt = teamsById[t.id] || { id: t.id, name: t.name, color: null, logoUrl: null, wordmarkUrl: null };
            return (
              <div key={t.id} className="rounded-lg p-3" style={{ background: PANEL2, border: `1px solid ${LINE}`, borderLeft: `4px solid ${teamColor(gt)}` }}>
                <div className="flex items-center gap-2 mb-2">
                  <input value={gt.name} onChange={e => updateGlobalTeamField(gt.id, 'name', e.target.value)} disabled={!isLoggedIn} className="flex-1 min-w-0 bg-[#222D42] border rounded px-2 py-1 text-sm font-semibold disabled:opacity-50" style={{ borderColor: LINE, color: CHALK }} />
                  <button onClick={() => onOpenHistory(gt.id)} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded flex-shrink-0" style={{ background: PANEL, color: PRIMARY, border: `1px solid ${LINE}` }}>
                    <History size={13} /> History
                  </button>
                </div>
                <BrandEditor gt={gt} updateGlobalTeamField={updateGlobalTeamField} />
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function TeamHistoryPage({ team, history, onBack, loading }) {
  const totalW = history.reduce((s, h) => s + (h.w || 0), 0);
  const totalL = history.reduce((s, h) => s + (h.l || 0), 0);
  const totalGp = totalW + totalL;
  const championships = history.filter(h => h.champion).length;
  return (
    <div className="p-4 space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: CHALK_DIM }}><ArrowLeft size={14} /> Back</button>
      <Panel>
        <div className="p-4 flex items-center gap-4" style={{ borderBottom: `1px solid ${LINE}` }}>
          {team?.logoUrl ? <img src={team.logoUrl} alt="" className="w-14 h-14 object-contain flex-shrink-0" /> : <div className="w-14 h-14 rounded-xl flex-shrink-0" style={{ background: team ? teamColor(team) : LINE }} />}
          <h2 className="text-xl font-black truncate" style={{ color: CHALK }}>{team ? team.name : '...'}</h2>
        </div>
        {!loading && history.length > 0 && (
          <div className="grid grid-cols-3 gap-px" style={{ background: LINE }}>
            <StatBox label="All-Time Record" value={`${totalW}-${totalL}`} />
            <StatBox label="Win %" value={totalGp > 0 ? (totalW / totalGp).toFixed(3).replace(/^0/, '') : '—'} />
            <StatBox label="Championships" value={championships} color={championships > 0 ? GOLD : CHALK} />
          </div>
        )}
        <div className="px-2 pb-3">
          {loading && <p className="px-2 py-4 text-sm" style={{ color: CHALK_DIM }}>Loading history…</p>}
          {!loading && history.length === 0 && <p className="px-2 py-4 text-sm" style={{ color: CHALK_DIM }}>This team hasn't played in any season yet.</p>}
          {!loading && history.map((h, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-2.5 text-sm" style={{ borderBottom: `1px solid ${LINE}` }}>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate" style={{ color: CHALK }}>{h.leagueName} — {h.seasonName}</div>
                <div className="text-xs font-mono" style={{ color: CHALK_DIM }}>{h.record} {h.rank ? `· #${h.rank} finish` : ''}</div>
                {h.managerName && <div className="text-[11px]" style={{ color: CHALK_DIM }}>Managed by {h.managerName}</div>}
              </div>
              {h.champion && <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded flex-shrink-0" style={{ background: 'rgba(245,198,75,0.15)', color: GOLD }}><Crown size={12} /> Champion</span>}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ==================================================================== */
/* Seasons management                                                    */
/* ==================================================================== */
function SeasonsView({ league, onBack, onSwitch, onCreate, onRename, onDelete, onSetChampion, teamsById, onSetTagline }) {
  const { isLoggedIn } = useAuth();
  const [newName, setNewName] = useState('');
  const [copyRoster, setCopyRoster] = useState(true);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [champPickerId, setChampPickerId] = useState(null);
  const [tagline, setTagline] = useState(league.tagline || '');

  return (
    <div className="p-4 space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: CHALK_DIM }}><ArrowLeft size={14} /> Back</button>
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY}>League tagline</SectionTitle>
        <div className="px-4 pb-4 flex gap-2">
          <input value={tagline} onChange={e => setTagline(e.target.value)} disabled={!isLoggedIn} placeholder="Shown under the league name" className="flex-1 bg-[#222D42] border rounded px-3 py-2 text-sm disabled:opacity-50" style={{ borderColor: LINE, color: CHALK }} />
          <button onClick={() => onSetTagline(tagline.trim())} disabled={!isLoggedIn} className="px-3 py-2 rounded font-bold text-sm disabled:opacity-50" style={{ background: PRIMARY, color: INK }}>Save</button>
        </div>
      </Panel>
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY}>Start a new season</SectionTitle>
        <div className="px-4 pb-4 space-y-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} disabled={!isLoggedIn} placeholder="e.g. 2026 Fall Season" className="w-full bg-[#222D42] border rounded px-3 py-2 text-sm disabled:opacity-50" style={{ borderColor: LINE, color: CHALK }} />
          <label className="flex items-center gap-2 text-xs" style={{ color: CHALK_DIM }}>
            <input type="checkbox" checked={copyRoster} onChange={e => setCopyRoster(e.target.checked)} disabled={!isLoggedIn} style={{ accentColor: PRIMARY }} /> Bring over teams from the current season (stats reset to 0)
          </label>
          <button onClick={() => { if (newName.trim()) { onCreate(newName.trim(), copyRoster); setNewName(''); } }} disabled={!isLoggedIn} className="px-3 py-2 rounded font-bold text-sm flex items-center gap-1 disabled:opacity-50" style={{ background: PRIMARY, color: INK }}>
            <Plus size={16} /> Create season
          </button>
        </div>
      </Panel>
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY}>Seasons &amp; champions</SectionTitle>
        <div className="px-2 pb-3">
          {league.seasons.map(s => {
            const champ = s.championTeamId ? teamsById[s.championTeamId] : null;
            const isActive = s.id === league.activeSeasonId;
            return (
              <div key={s.id} className="px-2 py-2.5" style={{ borderBottom: `1px solid ${LINE}` }}>
                {renamingId === s.id ? (
                  <div className="flex items-center gap-2">
                    <input value={renameVal} onChange={e => setRenameVal(e.target.value)} className="flex-1 bg-[#222D42] border rounded px-2 py-1 text-sm" style={{ borderColor: LINE, color: CHALK }} />
                    <button onClick={() => { onRename(s.id, renameVal.trim() || s.name); setRenamingId(null); }} disabled={!isLoggedIn} className="p-1.5 rounded disabled:opacity-50" style={{ color: PRIMARY }}><Check size={16} /></button>
                    <button onClick={() => setRenamingId(null)} className="p-1.5 rounded" style={{ color: CHALK_DIM }}><X size={16} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold flex items-center gap-2" style={{ color: isActive ? PRIMARY : CHALK }}>
                        {s.name} {isActive && <span className="text-[9px] uppercase px-1.5 py-0.5 rounded" style={{ background: PRIMARY, color: INK }}>Active</span>}
                      </div>
                      {champ && <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: GOLD }}><Crown size={11} /> {champ.name}</div>}
                    </div>
                    {!isActive && isLoggedIn && <button onClick={() => onSwitch(s.id)} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: PANEL2, color: PRIMARY, border: `1px solid ${LINE}` }}>Switch</button>}
                    {isLoggedIn && <button onClick={() => setChampPickerId(champPickerId === s.id ? null : s.id)} className="p-1.5 rounded" style={{ color: GOLD }}><Crown size={14} /></button>}
                    {isLoggedIn && <button onClick={() => { setRenamingId(s.id); setRenameVal(s.name); }} className="p-1.5 rounded" style={{ color: CHALK_DIM }}><Pencil size={14} /></button>}
                    {isLoggedIn && <button onClick={() => { if (confirm(`Delete season "${s.name}"? This cannot be undone.`)) onDelete(s.id); }} className="p-1.5 rounded" style={{ color: NEGATIVE }}><Trash2 size={14} /></button>}
                  </div>
                )}
                {champPickerId === s.id && isLoggedIn && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.members.map(m => {
                      const t = teamsById[m.teamId];
                      return <button key={m.teamId} onClick={() => { onSetChampion(s.id, m.teamId); setChampPickerId(null); }} className="text-xs px-2 py-1 rounded" style={{ background: PANEL2, color: CHALK, border: `1px solid ${LINE}` }}>{t ? t.name : m.scheduleName}</button>;
                    })}
                    <button onClick={() => { onSetChampion(s.id, null); setChampPickerId(null); }} className="text-xs px-2 py-1 rounded" style={{ color: CHALK_DIM }}>Clear</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ==================================================================== */
/* Home / round view                                                     */
/* ==================================================================== */
function ChampionBanner({ team }) {
  if (!team) return null;
  const emojis = ['🎉', '🏆', '🎊', '⭐', '🎉', '🏆', '🎊'];
  return (
    <div className="relative overflow-hidden rounded-xl p-5 text-center" style={{ background: `linear-gradient(135deg, ${GOLD}33, ${PANEL})`, border: `2px solid ${GOLD}` }}>
      <style>{`@keyframes lt-confetti-fall { 0% { transform: translateY(-14px) rotate(0deg); opacity: 1; } 100% { transform: translateY(70px) rotate(360deg); opacity: 0; } }`}</style>
      {emojis.map((e, i) => (
        <span key={i} style={{ position: 'absolute', left: `${8 + i * 13}%`, top: 0, fontSize: 18, animation: `lt-confetti-fall 2.4s ease-in ${i * 0.18}s infinite` }}>{e}</span>
      ))}
      <Crown size={30} style={{ color: GOLD, margin: '0 auto 6px' }} />
      <div className="text-lg font-black" style={{ color: GOLD }}>{team.name || team.displayName} won the championship!</div>
    </div>
  );
}

function HomeView({ season, rounds, roundIdx, setRoundIdx, teamsById, settings, onOpenTeam, h2hMatrix, sport }) {
  if (rounds.length === 0) {
    return <div className="p-4"><Panel><p className="px-4 py-8 text-sm text-center" style={{ color: CHALK_DIM }}>Import a schedule to see round-by-round standings here.</p></Panel></div>;
  }
  const round = rounds[roundIdx];
  const asOf = computeStandingsThroughRound(season, teamsById, rounds, roundIdx).active;
  const prevAsOf = roundIdx > 0 ? computeStandingsThroughRound(season, teamsById, rounds, roundIdx - 1).active : null;
  const prevRankById = {};
  if (prevAsOf) prevAsOf.forEach(t => { prevRankById[t.id] = t.rank; });
  const liveStandings = computeStandings(season, teamsById).active;
  const remaining = computeRemaining(season);
  const clinchElim = computeClinchElim(liveStandings, settings.playoffSpots, remaining);
  const seedScenarios = computeSeedScenarios(liveStandings, settings, season, teamsById, remaining);
  const clinched = liveStandings.filter(t => clinchElim[t.id]?.status === 'clinched');
  const eliminated = liveStandings.filter(t => clinchElim[t.id]?.status === 'eliminated');
  const stillAlive = liveStandings.filter(t => clinchElim[t.id]?.status === 'alive');
  const bubbleInTeam = liveStandings[settings.playoffSpots - 1] || null;
  const bubbleOutTeam = liveStandings[settings.playoffSpots] || null;
  const clinchSymbols = computeClinchSymbols(liveStandings, settings.playoffSpots, remaining);

  // Team of the round: best record (then point differential) among teams
  // that actually played in the currently-selected round.
  const roundTeamStats = {};
  round.games.filter(g => g.played && !g.isForfeit && g.homeTeamId && g.awayTeamId).forEach(g => {
    const w = gameWinner(g);
    if (!w) return;
    [g.homeTeamId, g.awayTeamId].forEach(id => { if (!roundTeamStats[id]) roundTeamStats[id] = { w: 0, l: 0, diff: 0 }; });
    const hs = Number(g.homeScore), as = Number(g.awayScore);
    roundTeamStats[g.homeTeamId].diff += hs - as;
    roundTeamStats[g.awayTeamId].diff += as - hs;
    if (w === 'home') { roundTeamStats[g.homeTeamId].w++; roundTeamStats[g.awayTeamId].l++; }
    else { roundTeamStats[g.awayTeamId].w++; roundTeamStats[g.homeTeamId].l++; }
  });
  const teamOfRoundId = Object.keys(roundTeamStats).sort((a, b) => {
    const sa = roundTeamStats[a], sb = roundTeamStats[b];
    return (sb.w - sb.l) - (sa.w - sa.l) || sb.diff - sa.diff;
  })[0];
  const teamOfRound = teamOfRoundId && roundTeamStats[teamOfRoundId].w > roundTeamStats[teamOfRoundId].l ? { team: teamsById[teamOfRoundId], stat: roundTeamStats[teamOfRoundId] } : null;

  return (
    <div className="p-4 space-y-4">
      <style>{`@keyframes lt-live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      {season.championTeamId && <ChampionBanner team={teamsById[season.championTeamId]} />}
      {(() => {
        const liveGames = (season.games || []).filter(g => g.isOngoing && !g.played);
        if (liveGames.length === 0) return null;
        return (
          <div className="rounded-xl p-3 space-y-2" style={{ background: `${NEGATIVE}14`, border: `1px solid ${NEGATIVE}55` }}>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: NEGATIVE, animation: 'lt-live-pulse 1.4s ease-in-out infinite' }} />
              <span className="text-[10px] uppercase font-bold" style={{ color: NEGATIVE }}>Live now</span>
            </div>
            {liveGames.map(g => {
              const away = teamsById[g.awayTeamId], home = teamsById[g.homeTeamId];
              const periodLabel = formatLivePeriod(sport, g.livePeriod, g.liveHalf);
              return (
                <div key={g.id} className="flex items-center gap-1.5 text-sm flex-wrap" style={{ color: CHALK }}>
                  {away && <TeamMark team={away} size={14} />} {away ? away.name : g.awayScheduleName}
                  {g.liveAwayScore != null && g.liveHomeScore != null && <span className="font-mono" style={{ color: CHALK_DIM }}>{g.liveAwayScore}–{g.liveHomeScore}</span>}
                  <span style={{ color: CHALK_DIM }}>@</span> {home ? home.name : g.homeScheduleName} {home && <TeamMark team={home} size={14} />}
                  {periodLabel && <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: `${NEGATIVE}22`, color: NEGATIVE }}>{periodLabel}</span>}
                </div>
              );
            })}
          </div>
        );
      })()}
      {teamOfRound && teamOfRound.team && (
        <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}55` }}>
          <Sparkles size={18} style={{ color: GOLD, flexShrink: 0 }} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase font-bold" style={{ color: GOLD }}>Team of the round</div>
            <div className="text-sm font-semibold truncate" style={{ color: CHALK }}>{teamOfRound.team.name} — {teamOfRound.stat.w}-{teamOfRound.stat.l}{teamOfRound.stat.diff !== 0 ? `, ${teamOfRound.stat.diff > 0 ? '+' : ''}${teamOfRound.stat.diff} diff` : ''}</div>
          </div>
        </div>
      )}
      {(() => {
        const playedGames = (season.games || []).filter(g => g.played && !g.isPlayoff && !g.isPlayIn && !g.isForfeit);
        const totalMargin = playedGames.reduce((s, g) => s + Math.abs(Number(g.homeScore) - Number(g.awayScore)), 0);
        const avgMargin = playedGames.length ? totalMargin / playedGames.length : 0;
        const leader = liveStandings[0];
        return (
          <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
            <SectionTitle accent={PRIMARY}>League snapshot</SectionTitle>
            <div className="grid grid-cols-3 gap-px" style={{ background: LINE }}>
              <StatBox label="Games Played" value={playedGames.length} />
              <StatBox label="Avg Margin" value={avgMargin.toFixed(1)} />
              <StatBox label="Teams" value={liveStandings.length} />
              <StatBox label="Leader" value={leader ? leader.displayName : '—'} color={leader ? teamColor(leader) : CHALK} />
              <StatBox label="Spots Clinched" value={`${clinched.length}/${settings.playoffSpots}`} color={clinched.length > 0 ? WIN : CHALK} />
              <StatBox label="Round" value={`${roundIdx + 1}/${rounds.length}`} />
            </div>
          </Panel>
        );
      })()}
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY} right={
          <div className="flex items-center gap-1">
            <button onClick={() => setRoundIdx(Math.max(0, roundIdx - 1))} disabled={roundIdx === 0} className="p-1 rounded disabled:opacity-30" style={{ color: PRIMARY }}><ChevronLeft size={16} /></button>
            <select value={roundIdx} onChange={e => setRoundIdx(Number(e.target.value))} className="bg-[#222D42] border rounded px-2 py-1 text-xs" style={{ borderColor: LINE, color: CHALK }}>
              {rounds.map((r, i) => <option style={{ background: PANEL2, color: CHALK }} key={i} value={i}>{settings.scheduleMode === 'round' && r.label !== '(unlabeled)' ? formatRoundLabel(r.label) : r.label}</option>)}
            </select>
            <button onClick={() => setRoundIdx(Math.min(rounds.length - 1, roundIdx + 1))} disabled={roundIdx === rounds.length - 1} className="p-1 rounded disabled:opacity-30" style={{ color: PRIMARY }}><ChevronRight size={16} /></button>
          </div>
        }>
          {settings.scheduleMode === 'round' && round.label !== '(unlabeled)' ? formatRoundLabel(round.label) : round.label}
        </SectionTitle>
        <div className="px-2 pb-3">
          {round.games.map(g => {
            const home = teamsById[g.homeTeamId], away = teamsById[g.awayTeamId];
            const homeColor = home ? teamColor(home) : LINE, awayColor = away ? teamColor(away) : LINE;
            const stories = !g.played && !g.isBye ? generateStorylines(liveStandings.find(t => t.id === g.homeTeamId), liveStandings.find(t => t.id === g.awayTeamId), h2hMatrix, settings.playoffSpots) : [];
            return (
              <div key={g.id} className="rounded mb-1" style={{ borderBottom: `1px solid ${LINE}` }}>
                <div className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderLeft: `3px solid ${awayColor}`, borderRight: `3px solid ${homeColor}` }}>
                  <span className="flex-1 truncate flex items-center gap-1.5" style={{ color: CHALK }}>
                    {away && <TeamMark team={away} size={14} />}
                    {away ? away.name : g.awayScheduleName} <span style={{ color: CHALK_DIM }}>@</span> {home ? home.name : g.homeScheduleName}
                    {home && <TeamMark team={home} size={14} />}
                  </span>
                  {g.played
                    ? <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: PANEL2, color: PRIMARY }}>{g.awayScore}–{g.homeScore}</span>
                    : <span className="text-[11px]" style={{ color: CHALK_DIM }}>unplayed</span>}
                </div>
                {stories.length > 0 && (
                  <div className="px-2 pb-2 space-y-0.5">
                    {stories.map((s, i) => <p key={i} className="text-[11px] italic" style={{ color: CHALK_DIM }}>{s}</p>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Standings through this round</SectionTitle>
        <div className="overflow-x-auto px-2 pb-4">
          <table className="w-full text-sm" style={{ color: CHALK }}>
            <thead><tr className="text-[10px] uppercase" style={{ color: CHALK_DIM }}>
              <th className="text-left px-2 py-1">#</th><th className="text-left px-2 py-1"></th><th className="text-left px-2 py-1">Team</th><th className="px-2 py-1">W-L</th><th className="px-2 py-1">GB</th>
            </tr></thead>
            <tbody>
              {asOf.map(t => {
                const delta = prevRankById[t.id] != null ? prevRankById[t.id] - t.rank : null;
                return (
                  <tr key={t.id} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td className="px-2 py-1.5 font-mono">{t.rank}</td>
                    <td className="px-2 py-1.5 text-xs font-mono" style={{ borderLeft: `3px solid ${teamColor(t)}` }}><MoveIndicator delta={delta} /></td>
                    <td className="px-2 py-1.5 font-semibold">
                      <button onClick={() => onOpenTeam(t.id)} className="flex items-center gap-2 text-left" style={{ color: CHALK }}>
                        <TeamMark team={t} size={16} /> <span className="truncate max-w-[130px]">{t.displayName}</span>
                        {(clinchSymbols[t.id] || []).map(s => <ClinchBadge key={s} symbol={s} />)}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono">{t.w}-{t.l}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{t.gb === 0 ? '-' : t.gb.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(asOf.some(t => (clinchSymbols[t.id] || []).length > 0)) && (
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>
            <span style={{ color: WIN }}>x</span>-clinched playoff spot &nbsp; <span style={{ color: GOLD }}>y</span>-clinched #1 seed &nbsp; <span style={{ color: NEGATIVE }}>z</span>-eliminated
          </p>
        )}
      </Panel>

      <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
        <SectionTitle accent={GOLD}>Clinch &amp; elimination watch</SectionTitle>
        <div className="px-4 pb-4 space-y-3">
          {clinched.length > 0 && (
            <div className="space-y-1">
              {clinched.map(t => { const d = describeClinchElim(t, clinchElim[t.id], t.rank, settings.playoffSpots, season, teamsById, bubbleOutTeam); return <p key={t.id} className="text-sm" style={{ color: d.color }}>{d.text}</p>; })}
            </div>
          )}
          {eliminated.length > 0 && (
            <div className="space-y-1">
              {eliminated.map(t => { const d = describeClinchElim(t, clinchElim[t.id], t.rank, settings.playoffSpots, season, teamsById, bubbleInTeam); return <p key={t.id} className="text-sm" style={{ color: d.color }}>{d.text}</p>; })}
            </div>
          )}
          {stillAlive.length > 0 && (
            <div className="space-y-1 pt-1" style={{ borderTop: (clinched.length || eliminated.length) ? `1px solid ${LINE}` : 'none' }}>
              {stillAlive.map(t => { const bubble = t.rank <= settings.playoffSpots ? bubbleOutTeam : bubbleInTeam; const d = describeClinchElim(t, clinchElim[t.id], t.rank, settings.playoffSpots, season, teamsById, bubble); return <p key={t.id} className="text-sm" style={{ color: d.color }}>{d.text}</p>; })}
            </div>
          )}
          {clinched.length === 0 && eliminated.length === 0 && stillAlive.length === 0 && <p className="text-sm" style={{ color: CHALK_DIM }}>Not enough data yet.</p>}
        </div>
      </Panel>

      {seedScenarios.length > 0 && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Seed scenarios</SectionTitle>
          <div className="px-4 pb-4 space-y-3">
            {Object.entries(seedScenarios.reduce((acc, s) => { (acc[s.group] = acc[s.group] || []).push(s); return acc; }, {})).map(([group, list]) => (
              <div key={group} className="space-y-1">
                <div className="text-[10px] uppercase font-bold" style={{ color: PRIMARY }}>{group}</div>
                {list.map(s => <p key={s.key} className="text-sm" style={{ color: s.color }}>{s.text}</p>)}
              </div>
            ))}
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>"What needs to happen" for the #1 seed, a 1st-round bye (if the bracket has one), and each division title.</p>
        </Panel>
      )}
    </div>
  );
}

/* ==================================================================== */
/* Standings view                                                        */
/* ==================================================================== */
function StandingsView({ standings, updateMemberField, season, settings, movementById, onOpenTeam }) {
  const { isLoggedIn } = useAuth();
  const [editBaseline, setEditBaseline] = useState(false);
  const [view, setView] = useState('overall');
  const [copied, setCopied] = useState(false);
  const remainingByTeam = computeRemaining(season);
  const clinchSymbols = computeClinchSymbols(standings, settings.playoffSpots, remainingByTeam);
  const hasDivisions = (season.divisions || []).length > 0;
  const { groups: divisionGroups, unassigned } = hasDivisions ? computeDivisionGroups(standings, season.divisions) : { groups: [], unassigned: [] };
  const copyStandings = () => {
    const lines = [`${season.name} — Standings`, ''];
    standings.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.displayName}  ${t.w}-${t.l}  (${t.pct.toFixed(3).replace(/^0/, '')})${t.gb > 0 ? `  ${t.gb.toFixed(1)} GB` : ''}`);
    });
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => { prompt('Copy this text:', text); });
    } else {
      prompt('Copy this text:', text);
    }
  };
  const downloadCsv = () => {
    const headers = ['Rank', 'Team', 'W', 'L', 'PCT', 'GB', 'RF', 'RA', 'Diff', 'RS/G', 'RA/G', 'SOS', 'SOV', 'Streak', 'Home', 'Away', '1-Run', 'X-Inn'];
    const rows = standings.map((t, i) => [
      i + 1, t.displayName, t.w, t.l, t.pct.toFixed(3), t.gb.toFixed(1), t.rf, t.ra, t.diff,
      t.rsPerG.toFixed(2), t.raPerG.toFixed(2), t.sos != null ? t.sos.toFixed(3) : '', t.sov != null ? t.sov.toFixed(3) : '',
      t.streak.label, `${t.homeW}-${t.homeL}`, `${t.awayW}-${t.awayL}`, `${t.oneRunW}-${t.oneRunL}`, `${t.xInnW}-${t.xInnL}`,
    ]);
    const esc = (v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${season.name.replace(/[^a-z0-9]+/gi, '-')}-stats.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-end">
        <button onClick={downloadCsv} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: PRIMARY }}><Save size={12} /> Export full stats CSV</button>
      </div>
      {hasDivisions && (
        <div className="flex rounded-lg overflow-hidden border w-fit" style={{ borderColor: LINE }}>
          {[['overall', 'Overall'], ['division', 'By Division']].map(([m, label]) => (
            <button key={m} onClick={() => setView(m)} className="px-3 py-1.5 text-xs font-bold" style={{ background: view === m ? PRIMARY : 'transparent', color: view === m ? INK : CHALK_DIM }}>{label}</button>
          ))}
        </div>
      )}
      {view === 'division' && hasDivisions ? (
        <>
          {divisionGroups.map(g => (
            <Panel key={g.division.id}>
              <SectionTitle>{g.division.conference ? `${g.division.conference} — ${g.division.name}` : g.division.name}</SectionTitle>
              <div className="overflow-x-auto px-2 pb-4">
                <table className="w-full text-sm" style={{ color: CHALK }}>
                  <thead><tr className="text-[10px] uppercase tracking-wide" style={{ color: CHALK_DIM }}>
                    <th className="text-left px-2 py-1">Team</th><th className="px-2 py-1">W</th><th className="px-2 py-1">L</th><th className="px-2 py-1">PCT</th><th className="px-2 py-1">GB</th><th className="px-2 py-1">Strk</th>
                  </tr></thead>
                  <tbody>
                    {g.teams.map(t => {
                      const symbols = clinchSymbols[t.id] || [];
                      return (
                        <tr key={t.id} style={{ borderTop: `1px solid ${LINE}` }}>
                          <td className="px-2 py-1.5 font-semibold" style={{ borderLeft: `3px solid ${teamColor(t)}` }}>
                            <button onClick={() => onOpenTeam(t.id)} className="flex items-center gap-2 text-left pl-1.5" style={{ color: CHALK }}>
                              <TeamMark team={t} size={16} /> <span className="truncate max-w-[120px]">{t.displayName}</span>
                              {symbols.map(s => <ClinchBadge key={s} symbol={s} />)}
                            </button>
                          </td>
                          <td className="px-2 py-1.5 text-center font-mono">{t.w}</td>
                          <td className="px-2 py-1.5 text-center font-mono">{t.l}</td>
                          <td className="px-2 py-1.5 text-center font-mono">{t.pct.toFixed(3).replace(/^0/, '')}</td>
                          <td className="px-2 py-1.5 text-center font-mono">{t.divGb === 0 ? '-' : t.divGb.toFixed(1)}</td>
                          <td className="px-2 py-1.5 text-center font-mono" style={{ color: t.streak.type === 'W' ? WIN : t.streak.type === 'L' ? NEGATIVE : CHALK_DIM }}>{t.streak.label}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
          {unassigned.length > 0 && (
            <Panel>
              <SectionTitle>Unassigned</SectionTitle>
              <div className="px-2 pb-3">
                {unassigned.map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderTop: `1px solid ${LINE}` }}>
                    <button onClick={() => onOpenTeam(t.id)} className="flex items-center gap-2" style={{ color: CHALK }}><TeamMark team={t} size={16} /> {t.displayName}</button>
                    <span className="font-mono text-xs" style={{ color: CHALK_DIM }}>{t.w}-{t.l}</span>
                  </div>
                ))}
              </div>
              <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Assign these to a division from the Teams tab.</p>
            </Panel>
          )}
        </>
      ) : (
      <Panel>
        <SectionTitle right={
          <div className="flex items-center gap-2">
            <button onClick={copyStandings} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: copied ? WIN : PRIMARY }}><Save size={12} /> {copied ? 'Copied!' : 'Copy'}</button>
            {isLoggedIn && <button onClick={() => setEditBaseline(v => !v)} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: PRIMARY }}><Pencil size={12} /> {editBaseline ? 'Done' : 'Edit starting record'}</button>}
          </div>
        }>
          Standings
        </SectionTitle>
        <div className="overflow-x-auto px-2 pb-4">
          <table className="w-full text-sm" style={{ color: CHALK }}>
            <thead><tr className="text-[10px] uppercase tracking-wide" style={{ color: CHALK_DIM }}>
              <th className="text-left px-2 py-1"></th><th className="text-left px-2 py-1">Team</th><th className="px-2 py-1">GP</th><th className="px-2 py-1">W</th><th className="px-2 py-1">L</th>
              <th className="px-2 py-1">PCT</th><th className="px-2 py-1">GB</th><th className="px-2 py-1">Strk</th><th className="px-2 py-1">L10</th><th className="px-2 py-1">RF</th><th className="px-2 py-1">RA</th><th className="px-2 py-1">DIFF</th>
            </tr></thead>
            <tbody>
              {standings.map(t => {
                const member = season.members.find(x => x.teamId === t.id);
                const delta = movementById ? movementById[t.id] : null;
                const l10W = t.last10.filter(r => r === 'W').length, l10L = t.last10.filter(r => r === 'L').length;
                const symbols = clinchSymbols[t.id] || [];
                return (
                  <tr key={t.id} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td className="pl-2 py-1.5 text-xs font-mono" style={{ borderLeft: `3px solid ${teamColor(t)}` }}><MoveIndicator delta={delta} /></td>
                    <td className="px-2 py-1.5 font-semibold">
                      <button onClick={() => onOpenTeam(t.id)} className="flex items-center gap-2 text-left" style={{ color: CHALK }}>
                        <TeamMark team={t} size={18} /> <span className="truncate max-w-[110px]">{t.displayName}</span>
                        {symbols.map(s => <ClinchBadge key={s} symbol={s} />)}
                        {t.gp >= 3 && t.l === 0 && <span title="Undefeated" style={{ fontSize: 12 }}>🔥</span>}
                        {t.gp >= 3 && t.w === 0 && <span title="Winless" style={{ fontSize: 12 }}>🥶</span>}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono">{t.gp}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{editBaseline ? <NumInput value={member?.baselineW ?? 0} onChange={v => updateMemberField(t.id, 'baselineW', v)} /> : t.w}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{editBaseline ? <NumInput value={member?.baselineL ?? 0} onChange={v => updateMemberField(t.id, 'baselineL', v)} /> : t.l}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{t.pct.toFixed(3).replace(/^0/, '')}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{t.gb === 0 ? '-' : t.gb.toFixed(1)}</td>
                    <td className="px-2 py-1.5 text-center font-mono" style={{ color: t.streak.type === 'W' ? WIN : t.streak.type === 'L' ? NEGATIVE : CHALK_DIM }}>{t.streak.label}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{l10W}-{l10L}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{editBaseline ? <NumInput value={member?.baselineRF ?? 0} onChange={v => updateMemberField(t.id, 'baselineRF', v)} /> : t.rf}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{editBaseline ? <NumInput value={member?.baselineRA ?? 0} onChange={v => updateMemberField(t.id, 'baselineRA', v)} /> : t.ra}</td>
                    <td className="px-2 py-1.5 text-center font-mono" style={{ color: t.diff > 0 ? WIN : t.diff < 0 ? NEGATIVE : CHALK_DIM }}>{t.diff > 0 ? `+${t.diff}` : t.diff}</td>
                  </tr>
                );
              })}
              {standings.length === 0 && <tr><td colSpan={12} className="text-center py-6 text-sm" style={{ color: CHALK_DIM }}>Add teams in the Teams tab, or import a schedule, to see standings.</td></tr>}
            </tbody>
          </table>
        </div>
        {editBaseline && <p className="px-4 pb-4 text-xs" style={{ color: CHALK_DIM }}>Starting record is added on top of results from played schedule games.</p>}
        {(standings.some(t => (clinchSymbols[t.id] || []).length > 0)) && (
          <p className="px-4 pb-2 text-[11px]" style={{ color: CHALK_DIM }}>
            <span style={{ color: WIN }}>x</span>-clinched playoff spot &nbsp; <span style={{ color: GOLD }}>y</span>-clinched #1 seed &nbsp; <span style={{ color: NEGATIVE }}>z</span>-eliminated
          </p>
        )}
        <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Movement compares to standings after the previous round.</p>
      </Panel>
      )}
    </div>
  );
}

/* ==================================================================== */
/* Settings view                                                         */
/* ==================================================================== */
function AppearanceSettings({ theme, saveTheme }) {
  const { isLoggedIn } = useAuth();
  return (
    <Panel>
      <SectionTitle>Appearance</SectionTitle>
      <div className="px-4 pb-4 space-y-4 text-sm">
        <p className="text-xs" style={{ color: CHALK_DIM }}>Changes apply everywhere in the app immediately, and stick across leagues and seasons.</p>
        <div className="flex gap-2">
          {[['dark', 'Dark mode'], ['light', 'Light mode']].map(([key, label]) => (
            <button key={key} onClick={() => saveTheme({ ...THEME_PRESETS[key] })} disabled={!isLoggedIn} className="flex-1 px-3 py-2 rounded font-bold text-xs disabled:opacity-50" style={{ background: PANEL2, color: PRIMARY, border: `1px solid ${LINE}` }}>{label}</button>
          ))}
        </div>
        {[
          ['chalk', 'Main text color', DEFAULT_THEME.chalk],
          ['chalkDim', 'Secondary text color', DEFAULT_THEME.chalkDim],
          ['primary', 'Accent color', DEFAULT_THEME.primary],
          ['ink', 'Page background', DEFAULT_THEME.ink],
          ['panel', 'Card background', DEFAULT_THEME.panel],
          ['panel2', 'Inset background', DEFAULT_THEME.panel2],
          ['line', 'Border color', DEFAULT_THEME.line],
        ].map(([key, label, fallback]) => (
          <label key={key} className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>{label}</span>
            <div className="flex items-center gap-2">
              <input type="color" value={theme[key] || fallback} onChange={e => saveTheme({ ...theme, [key]: e.target.value })} disabled={!isLoggedIn} className="w-9 h-8 rounded cursor-pointer bg-transparent disabled:opacity-50 disabled:cursor-not-allowed" style={{ border: `1px solid ${LINE}` }} />
              {isLoggedIn && <button onClick={() => saveTheme({ ...theme, [key]: fallback })} className="text-[11px]" style={{ color: CHALK_DIM }}>Reset</button>}
            </div>
          </label>
        ))}
      </div>
    </Panel>
  );
}
function SettingsView({ settings, saveSettings, theme, saveTheme, sport }) {
  const { isLoggedIn } = useAuth();
  return (
    <div className="p-4 space-y-4">
      <Panel>
        <SectionTitle>Season settings</SectionTitle>
        <fieldset disabled={!isLoggedIn} className="contents">
        <div className="px-4 pb-4 space-y-4 text-sm">
          <label className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>Playoff spots<div className="text-[11px]" style={{ color: CHALK_DIM }}>How many teams make the postseason</div></span>
            <NumInput value={settings.playoffSpots} min={1} max={64} onChange={v => saveSettings({ ...settings, playoffSpots: v })} w="w-16" />
          </label>
          <div className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>Playoff seeding<div className="text-[11px]" style={{ color: CHALK_DIM }}>Divisional gives each division's leader a guaranteed seed, then fills remaining spots with wild cards by record (needs divisions set up in the Teams tab)</div></span>
            <div className="flex rounded overflow-hidden border flex-shrink-0" style={{ borderColor: LINE }}>
              {[['overall', 'Overall'], ['divisional', 'Divisional']].map(([m, label]) => (
                <button key={m} onClick={() => saveSettings({ ...settings, playoffFormat: m })} className="px-2.5 py-1 text-xs font-semibold" style={{ background: (settings.playoffFormat || 'overall') === m ? PRIMARY : 'transparent', color: (settings.playoffFormat || 'overall') === m ? INK : CHALK_DIM }}>{label}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>Reseed each round<div className="text-[11px]" style={{ color: CHALK_DIM }}>Best remaining seed always plays the worst remaining seed (like the NFL) instead of following fixed bracket slots</div></span>
            <input type="checkbox" checked={!!settings.reseedPlayoffs} onChange={e => saveSettings({ ...settings, reseedPlayoffs: e.target.checked })} style={{ accentColor: PRIMARY, width: 18, height: 18 }} />
          </label>
          <label className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>Play-in tournament<div className="text-[11px]" style={{ color: CHALK_DIM }}>Number of bubble teams (0 = off) that play a single-elimination mini-bracket for the final playoff spot, instead of it going straight to the next-best record</div></span>
            <NumInput value={settings.playInTeams || 0} min={0} max={8} onChange={v => saveSettings({ ...settings, playInTeams: v })} w="w-16" />
          </label>
          <label className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>Playoff series length<div className="text-[11px]" style={{ color: CHALK_DIM }}>Default games per round — higher seed hosts more of them</div></span>
            <div className="flex rounded overflow-hidden border" style={{ borderColor: LINE }}>
              {[1, 3, 5, 7].map(n => (
                <button key={n} onClick={() => saveSettings({ ...settings, seriesLength: n })} className="px-2.5 py-1 text-xs font-semibold" style={{ background: (settings.seriesLength || 1) === n ? PRIMARY : 'transparent', color: (settings.seriesLength || 1) === n ? INK : CHALK_DIM }}>Bo{n}</button>
              ))}
            </div>
          </label>
          {(() => {
            const roundsCount = Math.max(1, Math.log2(nextPow2(Math.max(1, settings.playoffSpots))));
            const roundNames = (i) => i === 0 ? 'Round 1' : i === roundsCount - 1 ? 'Final' : `Round ${i + 1}`;
            return (
              <div className="pt-1" style={{ borderTop: `1px solid ${LINE}` }}>
                <div className="text-xs font-semibold mb-2" style={{ color: CHALK }}>Series length by round<div className="text-[11px] font-normal" style={{ color: CHALK_DIM }}>Override the default above for specific rounds (e.g. wild card round shorter, final longer)</div></div>
                <div className="flex flex-wrap gap-3">
                  {Array.from({ length: roundsCount }).map((_, i) => {
                    const round = i + 1;
                    const val = getSeriesLength(settings, round);
                    return (
                      <label key={i} className="flex flex-col items-center gap-1" style={{ color: CHALK }}>
                        <span className="text-[10px] uppercase" style={{ color: CHALK_DIM }}>{roundNames(i)}</span>
                        <div className="flex rounded overflow-hidden border" style={{ borderColor: LINE }}>
                          {[1, 3, 5, 7].map(n => (
                            <button key={n} onClick={() => {
                              const arr = Array.from({ length: roundsCount }, (_, ri) => getSeriesLength(settings, ri + 1));
                              arr[i] = n;
                              saveSettings({ ...settings, seriesLengths: arr });
                            }} className="px-2 py-1 text-[11px] font-semibold" style={{ background: val === n ? PRIMARY : 'transparent', color: val === n ? INK : CHALK_DIM }}>{n}</button>
                          ))}
                        </div>
                      </label>
                    );
                  })}
                </div>
                {Array.isArray(settings.seriesLengths) && (
                  <button onClick={() => { const s = { ...settings }; delete s.seriesLengths; saveSettings(s); }} className="text-[11px] mt-2" style={{ color: CHALK_DIM }}>Reset to default for all rounds</button>
                )}
              </div>
            );
          })()}
          <label className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>Home-field advantage<div className="text-[11px]" style={{ color: CHALK_DIM }}>Win-probability points added to the home team in playoff games</div></span>
            <NumInput value={settings.homeFieldBoost} min={0} max={20} onChange={v => saveSettings({ ...settings, homeFieldBoost: v })} w="w-16" />
          </label>
          <label className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>Simulation runs<div className="text-[11px]" style={{ color: CHALK_DIM }}>More runs = steadier playoff odds, slower to compute</div></span>
            <NumInput value={settings.simRuns} min={100} max={20000} step={100} onChange={v => saveSettings({ ...settings, simRuns: v })} w="w-20" />
          </label>
          <label className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>Standard {sport.periodPlural}<div className="text-[11px]" style={{ color: CHALK_DIM }}>Used to flag extra-{sport.periodPlural} games</div></span>
            <NumInput value={settings.standardInnings} min={1} max={15} onChange={v => saveSettings({ ...settings, standardInnings: v })} w="w-16" />
          </label>
          <label className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>Odds decimal places<div className="text-[11px]" style={{ color: CHALK_DIM }}>Precision shown on the Odds tab</div></span>
            <NumInput value={settings.oddsDecimals} min={0} max={2} onChange={v => saveSettings({ ...settings, oddsDecimals: v })} w="w-14" />
          </label>
          <div className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>Odds format<div className="text-[11px]" style={{ color: CHALK_DIM }}>Percent chance, or American moneyline ("+125")</div></span>
            <div className="flex rounded overflow-hidden border" style={{ borderColor: LINE }}>
              {['percent', 'american'].map(m => (
                <button key={m} onClick={() => saveSettings({ ...settings, oddsFormat: m })} className="px-2.5 py-1 text-xs font-semibold capitalize" style={{ background: (settings.oddsFormat || 'percent') === m ? PRIMARY : 'transparent', color: (settings.oddsFormat || 'percent') === m ? INK : CHALK_DIM }}>{m}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2" style={{ color: CHALK }}>
            <span>Schedule labels<div className="text-[11px]" style={{ color: CHALK_DIM }}>How games are grouped and labeled</div></span>
            <div className="flex rounded overflow-hidden border" style={{ borderColor: LINE }}>
              {['date', 'round'].map(m => (
                <button key={m} onClick={() => saveSettings({ ...settings, scheduleMode: m })} className="px-2.5 py-1 text-xs font-semibold capitalize" style={{ background: settings.scheduleMode === m ? PRIMARY : 'transparent', color: settings.scheduleMode === m ? INK : CHALK_DIM }}>{m}</button>
              ))}
            </div>
          </div>
        </div>
        </fieldset>
      </Panel>
      <AppearanceSettings theme={theme} saveTheme={saveTheme} />
    </div>
  );
}
/* ==================================================================== */
/* Teams (season roster) view                                            */
/* ==================================================================== */
function TeamsView({ season, teamsById, teamsIndex, addExistingTeam, createAndAddTeam, updateMemberField, updateGlobalTeamField, removeMember, onOpenTeam, importRosterSheet, addDivision, updateDivision, removeDivision, assignMemberDivision }) {
  const { isLoggedIn } = useAuth();
  const [name, setName] = useState('');
  const [pickId, setPickId] = useState('');
  const [sheetText, setSheetText] = useState('');
  const [sheetPreview, setSheetPreview] = useState(null);
  const [showSheetImport, setShowSheetImport] = useState(false);
  const [search, setSearch] = useState('');
  const memberIds = new Set(season.members.map(m => m.teamId));
  const available = teamsIndex.filter(t => !memberIds.has(t.id));

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const teamHits = season.members.filter(m => {
      const gt = teamsById[m.teamId];
      return (gt && gt.name.toLowerCase().includes(q)) || (m.scheduleName || '').toLowerCase().includes(q);
    }).map(m => ({ type: 'team', teamId: m.teamId, name: (teamsById[m.teamId] && teamsById[m.teamId].name) || m.scheduleName }));
    const playerHits = [];
    season.members.forEach(m => {
      (m.roster || []).forEach(p => {
        if (p.name.toLowerCase().includes(q)) {
          playerHits.push({ type: 'player', teamId: m.teamId, name: p.name, teamName: (teamsById[m.teamId] && teamsById[m.teamId].name) || m.scheduleName });
        }
      });
    });
    return [...teamHits, ...playerHits];
  }, [search, season.members, teamsById]);

  const handleSheetFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setSheetText(String(reader.result || ''));
    reader.readAsText(f);
  };
  const runSheetPreview = () => setSheetPreview(parseRosterSheetCsv(sheetText));

  return (
    <div className="p-4 space-y-4">
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY}>Search teams &amp; players</SectionTitle>
        <div className="px-4 pb-4 space-y-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search this season…" className="w-full bg-[#222D42] border rounded px-3 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }} />
          {searchResults && (
            <div className="rounded-lg border max-h-56 overflow-y-auto" style={{ borderColor: LINE }}>
              {searchResults.length === 0 && <p className="px-3 py-3 text-xs" style={{ color: CHALK_DIM }}>No matches.</p>}
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => onOpenTeam(r.teamId)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left" style={{ borderTop: i > 0 ? `1px solid ${LINE}` : 'none' }}>
                  {r.type === 'team' ? <Users size={13} style={{ color: PRIMARY }} /> : <span style={{ fontSize: 11, color: CHALK_DIM }}>●</span>}
                  <span style={{ color: CHALK }}>{r.name}</span>
                  {r.type === 'player' && <span className="text-xs" style={{ color: CHALK_DIM }}>({r.teamName})</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </Panel>
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY}>Add a team to this season</SectionTitle>
        <fieldset disabled={!isLoggedIn} className="contents">
        <div className="px-4 pb-4 space-y-3">
          <div className="flex gap-2">
            <select value={pickId} onChange={e => setPickId(e.target.value)} className="flex-1 bg-[#222D42] border rounded px-2 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }}>
              <option style={{ background: PANEL2, color: CHALK }} value="">Choose an existing team…</option>
              {available.map(t => <option style={{ background: PANEL2, color: CHALK }} key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={() => { if (pickId) { addExistingTeam(pickId); setPickId(''); } }} disabled={!pickId} className="px-3 py-2 rounded font-bold text-sm disabled:opacity-40" style={{ background: PRIMARY, color: INK }}>Add</button>
          </div>
          <div className="flex gap-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Or create a new team" className="flex-1 bg-[#222D42] border rounded px-3 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }} />
            <button onClick={() => { if (name.trim()) { createAndAddTeam(name.trim()); setName(''); } }} className="px-3 py-2 rounded font-bold text-sm flex items-center gap-1" style={{ background: PRIMARY, color: INK }}><Plus size={16} /> Create</button>
          </div>
        </div>
        </fieldset>
      </Panel>

      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY} right={<button onClick={() => setShowSheetImport(v => !v)} disabled={!isLoggedIn} className="text-[11px] font-bold disabled:opacity-40" style={{ color: PRIMARY }}>{showSheetImport ? 'Hide' : 'Import'}</button>}>Import a full roster sheet</SectionTitle>
        {showSheetImport && isLoggedIn && (
          <div className="px-4 pb-4 space-y-2">
            <p className="text-xs" style={{ color: CHALK_DIM }}>Paste or upload a CSV export of a roster spreadsheet with several teams laid out side by side (Role, Username, Stars columns per team). Teams are matched by name — new ones are created automatically. Re-importing replaces each matched team's roster with what's in the sheet, so it always matches exactly (no duplicate or stale players left behind).</p>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-semibold cursor-pointer" style={{ background: PANEL2, color: CHALK, border: `1px solid ${LINE}` }}>
              <Upload size={14} /> Choose .csv file
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleSheetFile} />
            </label>
            <textarea value={sheetText} onChange={e => setSheetText(e.target.value)} rows={5} placeholder="Paste roster sheet CSV here…" className="w-full bg-[#222D42] border rounded px-3 py-2 text-xs font-mono" style={{ borderColor: LINE, color: CHALK }} />
            <button onClick={runSheetPreview} disabled={!sheetText.trim()} className="px-3 py-2 rounded font-bold text-sm disabled:opacity-40" style={{ background: PRIMARY, color: INK }}>Preview import</button>
            {sheetPreview && (
              <div className="rounded-lg border" style={{ borderColor: LINE }}>
                {sheetPreview.length === 0 ? (
                  <p className="px-3 py-3 text-xs" style={{ color: NEGATIVE }}>Couldn't find any "Team | Name | Stars" style blocks in that file. Double check the header row text matches exactly.</p>
                ) : (
                  <>
                    <div className="max-h-56 overflow-y-auto divide-y" style={{ borderColor: LINE }}>
                      {sheetPreview.map((b, i) => {
                        const existing = teamsIndex.find(t => t.name.toLowerCase() === b.teamName.toLowerCase());
                        return (
                          <div key={i} className="px-3 py-2 text-xs">
                            <div className="flex items-center gap-2">
                              {existing ? <Check size={12} style={{ color: WIN }} /> : <Plus size={12} style={{ color: GOLD }} />}
                              <span className="font-bold" style={{ color: CHALK }}>{b.teamName}</span>
                              <span style={{ color: CHALK_DIM }}>{existing ? '(existing team)' : '(will be created)'} · {b.players.length} players</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-end gap-2 px-3 py-2">
                      <button onClick={() => { setSheetPreview(null); setSheetText(''); setShowSheetImport(false); }} className="text-xs" style={{ color: CHALK_DIM }}>Cancel</button>
                      <button onClick={() => { importRosterSheet(sheetPreview); setSheetPreview(null); setSheetText(''); setShowSheetImport(false); }} className="px-3 py-1.5 rounded font-bold text-xs" style={{ background: PRIMARY, color: INK }}>Import {sheetPreview.reduce((s, b) => s + b.players.length, 0)} players across {sheetPreview.length} teams</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY}>Roster, colors &amp; logos</SectionTitle>
        <fieldset disabled={!isLoggedIn} className="contents">
        <div className="px-3 pb-3 space-y-3">
          {season.members.length === 0 && <p className="px-1 py-4 text-sm" style={{ color: CHALK_DIM }}>No teams yet.</p>}
          {season.members.map(m => {
            const gt = teamsById[m.teamId] || { id: m.teamId, name: m.scheduleName, color: null, logoUrl: null, wordmarkUrl: null };
            return (
              <div key={m.teamId} className="rounded-lg p-3" style={{ background: PANEL2, border: `1px solid ${LINE}`, borderLeft: `4px solid ${teamColor(gt)}`, opacity: m.active === false ? 0.55 : 1 }}>
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => onOpenTeam(m.teamId)} className="flex-1 min-w-0 text-left text-sm font-semibold truncate" style={{ color: CHALK }}>{gt.name}</button>
                  <button onClick={() => updateMemberField(m.teamId, 'active', m.active === false ? true : false)} className="text-[10px] px-2 py-1 rounded font-semibold flex-shrink-0" style={{ background: PANEL, color: m.active === false ? GOLD : CHALK_DIM, border: `1px solid ${LINE}` }}>
                    {m.active === false ? 'Inactive' : 'Active'}
                  </button>
                  <button onClick={() => { if (confirm(`Remove ${gt.name} from this season?`)) removeMember(m.teamId); }} className="p-1.5 rounded flex-shrink-0" style={{ color: NEGATIVE }}><Trash2 size={14} /></button>
                </div>
                <div className="flex items-center gap-3 flex-wrap pl-1 mb-2">
                  <span className="text-[10px] uppercase" style={{ color: CHALK_DIM }}>Matches schedule text:</span>
                  <input value={m.scheduleName ?? gt.name} onChange={e => updateMemberField(m.teamId, 'scheduleName', e.target.value)} className="flex-1 min-w-[100px] bg-[#222D42] border rounded px-2 py-1 text-xs" style={{ borderColor: LINE, color: CHALK }} />
                </div>
                <div className="flex items-center gap-3 flex-wrap pl-1 mb-2">
                  <span className="text-[10px] uppercase" style={{ color: CHALK_DIM }}>Manager:</span>
                  {(() => {
                    const pmPlayer = (m.roster || []).find(p => (p.role || '').trim().toUpperCase() === 'PM');
                    return pmPlayer
                      ? <span className="flex-1 min-w-[100px] text-xs px-2 py-1" style={{ color: CHALK }}>{pmPlayer.name} <span style={{ color: CHALK_DIM }}>(from roster PM slot)</span></span>
                      : <input value={m.managerName || ''} onChange={e => updateMemberField(m.teamId, 'managerName', e.target.value)} placeholder="Optional" className="flex-1 min-w-[100px] bg-[#222D42] border rounded px-2 py-1 text-xs" style={{ borderColor: LINE, color: CHALK }} />;
                  })()}
                </div>
                {(season.divisions || []).length > 0 && (
                  <div className="flex items-center gap-3 flex-wrap pl-1 mb-2">
                    <span className="text-[10px] uppercase" style={{ color: CHALK_DIM }}>Division:</span>
                    <select value={m.divisionId || ''} onChange={e => assignMemberDivision(m.teamId, e.target.value)} className="flex-1 min-w-[100px] bg-[#222D42] border rounded px-2 py-1 text-xs" style={{ borderColor: LINE, color: CHALK }}>
                      <option style={{ background: PANEL2, color: CHALK }} value="">Unassigned</option>
                      {season.divisions.map(d => <option style={{ background: PANEL2, color: CHALK }} key={d.id} value={d.id}>{d.conference ? `${d.conference} — ${d.name}` : d.name}</option>)}
                    </select>
                  </div>
                )}
                <BrandEditor gt={gt} updateGlobalTeamField={updateGlobalTeamField} />
              </div>
            );
          })}
        </div>
        </fieldset>
      </Panel>

      <DivisionsPanel divisions={season.divisions || []} addDivision={addDivision} updateDivision={updateDivision} removeDivision={removeDivision} />
    </div>
  );
}

function DivisionsPanel({ divisions, addDivision, updateDivision, removeDivision }) {
  const { isLoggedIn } = useAuth();
  const [name, setName] = useState('');
  const [conference, setConference] = useState('');
  const [editingId, setEditingId] = useState(null);
  return (
    <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
      <SectionTitle accent={PRIMARY}>Divisions &amp; conferences</SectionTitle>
      <fieldset disabled={!isLoggedIn} className="contents">
      <div className="px-4 pb-2 space-y-2">
        <p className="text-xs" style={{ color: CHALK_DIM }}>Optional — group teams into divisions (and divisions into conferences) for grouped standings and, if you turn on "Divisional" playoff format in Settings, guaranteed division-winner seeds plus wild cards.</p>
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Division name (e.g. East)" className="flex-1 bg-[#222D42] border rounded px-3 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }} />
          <input value={conference} onChange={e => setConference(e.target.value)} placeholder="Conference (optional)" className="flex-1 bg-[#222D42] border rounded px-3 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }} />
        </div>
        <button onClick={() => { if (name.trim()) { addDivision(name.trim(), conference.trim()); setName(''); setConference(''); } }} className="px-3 py-2 rounded font-bold text-sm flex items-center gap-1" style={{ background: PRIMARY, color: INK }}><Plus size={16} /> Add division</button>
      </div>
      <div className="px-2 pb-2">
        {divisions.length === 0 && <p className="px-2 py-3 text-sm" style={{ color: CHALK_DIM }}>No divisions yet.</p>}
        {divisions.map(d => (
          <div key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ borderTop: `1px solid ${LINE}` }}>
            {editingId === d.id ? (
              <>
                <input value={d.name} onChange={e => updateDivision(d.id, 'name', e.target.value)} className="flex-1 min-w-0 bg-[#222D42] border rounded px-2 py-1 text-xs" style={{ borderColor: LINE, color: CHALK }} />
                <input value={d.conference || ''} onChange={e => updateDivision(d.id, 'conference', e.target.value)} placeholder="Conference" className="flex-1 min-w-0 bg-[#222D42] border rounded px-2 py-1 text-xs" style={{ borderColor: LINE, color: CHALK }} />
                <button onClick={() => setEditingId(null)} className="p-1" style={{ color: WIN }}><Check size={16} /></button>
              </>
            ) : (
              <>
                <span className="flex-1 min-w-0 truncate" style={{ color: CHALK }}>{d.conference ? `${d.conference} — ${d.name}` : d.name}</span>
                <button onClick={() => setEditingId(d.id)} className="p-1" style={{ color: CHALK_DIM }}><Pencil size={13} /></button>
                <button onClick={() => removeDivision(d.id)} className="p-1" style={{ color: NEGATIVE }}><Trash2 size={13} /></button>
              </>
            )}
          </div>
        ))}
      </div>
      </fieldset>
    </Panel>
  );
}

/* ==================================================================== */
/* Schedule view                                                         */
/* ==================================================================== */
function ScheduleBalanceChecker({ season, teamsById }) {
  const [open, setOpen] = useState(false);
  const stats = {};
  season.members.forEach(m => { stats[m.teamId] = { home: 0, away: 0, opponents: {} }; });
  (season.games || []).filter(g => !g.isPlayoff && !g.isPlayIn && g.homeTeamId && g.awayTeamId).forEach(g => {
    if (stats[g.homeTeamId]) { stats[g.homeTeamId].home++; stats[g.homeTeamId].opponents[g.awayTeamId] = (stats[g.homeTeamId].opponents[g.awayTeamId] || 0) + 1; }
    if (stats[g.awayTeamId]) { stats[g.awayTeamId].away++; stats[g.awayTeamId].opponents[g.homeTeamId] = (stats[g.awayTeamId].opponents[g.homeTeamId] || 0) + 1; }
  });
  const rows = season.members.map(m => {
    const s = stats[m.teamId] || { home: 0, away: 0, opponents: {} };
    const total = s.home + s.away;
    const oppCounts = Object.values(s.opponents);
    const oppSpread = oppCounts.length ? Math.max(...oppCounts) - Math.min(...oppCounts) : 0;
    return { teamId: m.teamId, name: (teamsById[m.teamId] && teamsById[m.teamId].name) || m.scheduleName, home: s.home, away: s.away, total, homeAwayGap: Math.abs(s.home - s.away), oppSpread };
  });
  const flagged = rows.filter(r => r.total > 0 && (r.homeAwayGap >= 3 || r.oppSpread >= 2));
  if (rows.every(r => r.total === 0)) return null;
  return (
    <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
      <SectionTitle accent={PRIMARY} right={<button onClick={() => setOpen(v => !v)} className="text-[11px] font-bold" style={{ color: PRIMARY }}>{open ? 'Hide' : 'Check'}</button>}>Schedule balance</SectionTitle>
      {!open ? (
        <p className="px-4 pb-4 text-xs" style={{ color: CHALK_DIM }}>{flagged.length === 0 ? 'No major home/away or opponent-count imbalances detected.' : `${flagged.length} team${flagged.length === 1 ? '' : 's'} with a notable imbalance — tap Check for details.`}</p>
      ) : (
        <>
          <div className="px-2 pb-2">
            {rows.map(r => (
              <div key={r.teamId} className="flex items-center gap-2 px-2 py-1.5 text-sm" style={{ borderTop: `1px solid ${LINE}` }}>
                <span className="flex-1 truncate" style={{ color: CHALK }}>{r.name}</span>
                <span className="font-mono text-xs" style={{ color: r.homeAwayGap >= 3 ? GOLD : CHALK_DIM }}>{r.home}H-{r.away}A</span>
                <span className="font-mono text-xs" style={{ color: r.oppSpread >= 2 ? GOLD : CHALK_DIM }}>opp spread {r.oppSpread}</span>
              </div>
            ))}
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Flags a team in gold when their home/away split differs by 3+ games, or when they play some opponents notably more than others (spread of 2+ meetings).</p>
        </>
      )}
    </Panel>
  );
}

function RoundRobinGenerator({ season, teamsById, generateSchedule }) {
  const { isLoggedIn } = useAuth();
  const [selected, setSelected] = useState(() => new Set(season.members.map(m => m.teamId)));
  const [roundsOfPlay, setRoundsOfPlay] = useState(2);
  const [open, setOpen] = useState(false);
  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const count = selected.size;
  const gamesPreview = count >= 2 ? count * (count - 1) / 2 * roundsOfPlay : 0;
  return (
    <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
      <SectionTitle accent={PRIMARY} right={isLoggedIn && <button onClick={() => setOpen(v => !v)} className="text-[11px] font-bold" style={{ color: PRIMARY }}>{open ? 'Hide' : 'Open'}</button>}>Generate round-robin schedule</SectionTitle>
      {open && isLoggedIn && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs" style={{ color: CHALK_DIM }}>Automatically builds a full schedule where every selected team plays every other one evenly — no manual entry needed. Adds to whatever's already on the schedule.</p>
          <div className="flex flex-wrap gap-2">
            {season.members.map(m => {
              const gt = teamsById[m.teamId];
              const on = selected.has(m.teamId);
              return <button key={m.teamId} onClick={() => toggle(m.teamId)} className="text-xs px-2 py-1 rounded font-semibold" style={{ background: on ? PRIMARY : PANEL2, color: on ? INK : CHALK_DIM, border: `1px solid ${LINE}` }}>{gt ? gt.name : m.scheduleName}</button>;
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm" style={{ color: CHALK }}>Times each pair plays</span>
            <NumInput value={roundsOfPlay} min={1} max={10} onChange={setRoundsOfPlay} w="w-16" />
          </div>
          <p className="text-xs font-mono" style={{ color: CHALK_DIM }}>{count} teams selected → {gamesPreview} games</p>
          <button onClick={() => { generateSchedule([...selected], roundsOfPlay); setOpen(false); }} disabled={count < 2} className="px-3 py-2 rounded font-bold text-sm disabled:opacity-40" style={{ background: PRIMARY, color: INK }}>Generate schedule</button>
        </div>
      )}
    </Panel>
  );
}

function ScheduleView({ season, settings, importGames, addManualGame, saveScore, deleteGame, declareForfeit, setWinnerOverride, teamsById, sport, generateSchedule, updateGameNotes, setGameOngoing, swapHomeAway }) {
  const { isLoggedIn } = useAuth();
  const scheduleMode = settings.scheduleMode || 'date';
  const labelWord = scheduleMode === 'round' ? 'Round' : 'Date';
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [scoreForm, setScoreForm] = useState({ away: '', home: '', innings: '7' });
  const [liveEditingId, setLiveEditingId] = useState(null);
  const [liveForm, setLiveForm] = useState({ away: '0', home: '0', period: '1', half: 'top' });
  const [manual, setManual] = useState({ date: '', awayTeamId: '', homeTeamId: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState('all');
  const [openLabel, setOpenLabel] = useState(null);
  const games = season.games || [];

  const groups = [];
  const seenKeys = {};
  games.forEach(g => {
    const gkey = roundGroupKey(g.date, scheduleMode);
    if (!(gkey in seenKeys)) { seenKeys[gkey] = { key: gkey, label: g.date || 'Unlabeled', games: [], isPlayoff: !!g.isPlayoff, isPlayIn: !!g.isPlayIn }; groups.push(seenKeys[gkey]); }
    seenKeys[gkey].games.push(g);
  });
  // Same fix as getOrderedRounds: sort by actual round/date number, not by
  // whichever round's first game happened to be entered first.
  groups.sort((a, b) => {
    if (a.isPlayoff !== b.isPlayoff) return a.isPlayoff ? 1 : -1;
    if (a.isPlayIn !== b.isPlayIn) return a.isPlayIn ? 1 : -1;
    if (a.isPlayoff || a.isPlayIn) return 0; // keep playoff/play-in groups in their generated order
    return compareGameDates(a.label, b.label, scheduleMode);
  });

  useEffect(() => {
    if (groups.length === 0) { setOpenLabel(null); return; }
    let idx = 0;
    for (let i = 0; i < groups.length; i++) if (groups[i].games.some(g => g.played)) idx = i;
    setOpenLabel(groups[idx].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season.id, games.length]);

  const handleFile = (e) => { const f = e.target.files[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => setText(String(reader.result || '')); reader.readAsText(f); };
  const runPreview = () => setPreview(parseScheduleText(text, scheduleMode));
  const confirmImport = () => { if (!preview) return; importGames(preview.filter(r => r.matched)); setPreview(null); setText(''); setShowAdd(false); };
  const openScoreEditor = (g) => { setEditingId(g.id); setLiveEditingId(null); setScoreForm({ away: g.awayScore ?? '', home: g.homeScore ?? '', innings: g.innings ?? String(settings.standardInnings || 7) }); };
  const [copied, setCopied] = useState(false);
  const copySchedule = () => {
    const lines = [`${season.name} — Schedule`, ''];
    groups.forEach(g => {
      lines.push(`${scheduleMode === 'round' && !g.isPlayoff && !g.isPlayIn && g.label !== 'Unlabeled' ? formatRoundLabel(g.label) : g.label}:`);
      g.games.forEach(game => {
        const away = teamsById[game.awayTeamId], home = teamsById[game.homeTeamId];
        const awayName = away ? away.name : game.awayScheduleName, homeName = home ? home.name : game.homeScheduleName;
        lines.push(`  ${awayName} @ ${homeName}${game.played ? `  (${game.awayScore}-${game.homeScore})` : ''}`);
      });
      lines.push('');
    });
    const text2 = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text2).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => { prompt('Copy this text:', text2); });
    } else { prompt('Copy this text:', text2); }
  };

  return (
    <div className="p-4 space-y-4">
      <style>{`@keyframes lt-live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      {(() => {
        const regGames = games.filter(g => !g.isPlayoff && !g.isPlayIn);
        const played = regGames.filter(g => g.played);
        const totalMargin = played.filter(g => !g.isForfeit).reduce((s, g) => s + Math.abs(Number(g.homeScore) - Number(g.awayScore)), 0);
        const marginCount = played.filter(g => !g.isForfeit).length;
        return (
          <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
            <SectionTitle accent={PRIMARY}>Schedule snapshot</SectionTitle>
            <div className="grid grid-cols-3 gap-px" style={{ background: LINE }}>
              <StatBox label="Total Games" value={regGames.length} />
              <StatBox label="Played" value={played.length} color={WIN} />
              <StatBox label="Remaining" value={regGames.length - played.length} />
              <StatBox label="Avg Margin" value={marginCount ? (totalMargin / marginCount).toFixed(1) : '—'} />
            </div>
          </Panel>
        );
      })()}
      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY} right={
          <div className="flex items-center gap-2">
            <button onClick={copySchedule} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: copied ? WIN : PRIMARY }}><Save size={12} /> {copied ? 'Copied!' : 'Copy'}</button>
            <span className="text-[11px] font-mono" style={{ color: CHALK_DIM }}>{games.filter(g => g.played).length}/{games.length} played</span>
          </div>
        }>Schedule</SectionTitle>
        <div className="flex gap-1 px-4 pb-3">
          {['all', 'upcoming', 'played'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className="px-2.5 py-1 rounded text-[11px] font-semibold capitalize" style={{ background: filter === f ? PRIMARY : PANEL2, color: filter === f ? INK : CHALK_DIM }}>{f}</button>
          ))}
        </div>
        <div className="px-2 pb-3 space-y-2">
          {groups.length === 0 && <p className="px-2 py-4 text-sm" style={{ color: CHALK_DIM }}>No games yet — add some below.</p>}
          {groups.map(group => {
            const visibleGames = group.games.filter(g => filter === 'all' || (filter === 'played' && g.played) || (filter === 'upcoming' && !g.played));
            if (visibleGames.length === 0) return null;
            const isOpen = openLabel === group.key;
            const playedCount = group.games.filter(g => g.played).length;
            return (
              <div key={group.key} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
                <button onClick={() => setOpenLabel(isOpen ? null : group.key)} className="w-full flex items-center gap-2 px-3 py-2 text-left" style={{ background: PANEL2 }}>
                  {group.isPlayoff && <Crown size={12} style={{ color: GOLD }} />}
                  {group.isPlayIn && <Sparkles size={12} style={{ color: PRIMARY }} />}
                  <span className="flex-1 text-xs font-bold uppercase tracking-wide" style={{ color: group.isPlayoff ? GOLD : group.isPlayIn ? PRIMARY : PRIMARY }}>
                    {scheduleMode === 'round' && !group.isPlayoff && !group.isPlayIn && group.label !== 'Unlabeled' ? formatRoundLabel(group.label) : group.label}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: CHALK_DIM }}>{playedCount}/{group.games.length}</span>
                  <ChevronRight size={14} style={{ color: CHALK_DIM, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>
                {isOpen && visibleGames.map(g => {
                  const home = teamsById[g.homeTeamId], away = teamsById[g.awayTeamId];
                  const homeColor = home ? teamColor(home) : LINE, awayColor = away ? teamColor(away) : LINE;
                  const w = gameWinner(g);
                  return (
                    <div key={g.id} style={{ borderTop: `1px solid ${LINE}` }}>
                      <div className="flex items-center gap-2 px-3 py-2 text-sm" style={{ borderLeft: `3px solid ${awayColor}`, borderRight: `3px solid ${homeColor}` }}>
                        <span className="flex-1 truncate flex items-center gap-1.5" style={{ color: CHALK }}>
                          {away && <TeamMark team={away} size={14} />}
                          {away ? away.name : g.awayScheduleName} <span style={{ color: CHALK_DIM }}>@</span> {home ? home.name : g.homeScheduleName}
                          {home && <TeamMark team={home} size={14} />}
                        </span>
                        {g.played
                          ? <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: PANEL, color: PRIMARY }}>
                              {g.awayScore}–{g.homeScore}{g.innings && g.innings !== (settings.standardInnings || 7) && !g.isPlayoff ? ` (${g.innings})` : ''}
                              {g.isForfeit ? ' (F)' : ''}{g.winnerOverride ? ' *' : ''}
                            </span>
                          : g.isOngoing
                            ? <span className="flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded" style={{ background: `${NEGATIVE}22`, color: NEGATIVE }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: NEGATIVE, animation: 'lt-live-pulse 1.4s ease-in-out infinite' }} />
                                LIVE{g.liveAwayScore != null && g.liveHomeScore != null ? ` ${g.liveAwayScore}–${g.liveHomeScore}` : ''}{formatLivePeriod(sport, g.livePeriod, g.liveHalf) ? ` · ${formatLivePeriod(sport, g.livePeriod, g.liveHalf)}` : ''}
                              </span>
                            : <span className="text-[11px]" style={{ color: CHALK_DIM }}>unplayed</span>}
                        {!g.played && isLoggedIn && (
                          <button onClick={() => { setLiveForm({ away: String(g.liveAwayScore ?? 0), home: String(g.liveHomeScore ?? 0), period: String(g.livePeriod ?? 1), half: g.liveHalf || 'top' }); setLiveEditingId(g.id); setEditingId(null); }} className="p-1 rounded" style={{ color: g.isOngoing ? NEGATIVE : CHALK_DIM }} title={g.isOngoing ? 'Update live game' : 'Mark as ongoing'}><Activity size={13} /></button>
                        )}
                        {isLoggedIn && <button onClick={() => swapHomeAway(g.id)} className="p-1 rounded font-bold text-xs" style={{ color: CHALK_DIM }} title="Swap home/away">⇄</button>}
                        {isLoggedIn && <button onClick={() => openScoreEditor(g)} className="p-1 rounded" style={{ color: PRIMARY }}><Pencil size={13} /></button>}
                        {isLoggedIn && <button onClick={() => deleteGame(g.id)} className="p-1 rounded" style={{ color: NEGATIVE }}><Trash2 size={13} /></button>}
                      </div>
                      {liveEditingId === g.id && (
                        <div className="px-3 pb-3 space-y-2" style={{ borderLeft: `3px solid ${awayColor}`, borderRight: `3px solid ${homeColor}` }}>
                          <div className="flex flex-wrap items-end gap-2">
                            <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>Away (live)</div><NumInput value={liveForm.away} onChange={v => setLiveForm(f => ({ ...f, away: v }))} min={0} /></div>
                            <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>Home (live)</div><NumInput value={liveForm.home} onChange={v => setLiveForm(f => ({ ...f, home: v }))} min={0} /></div>
                            <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>{sport.period.charAt(0).toUpperCase() + sport.period.slice(1)}</div><NumInput value={liveForm.period} onChange={v => setLiveForm(f => ({ ...f, period: v }))} min={1} w="w-12" /></div>
                            {sport.period === 'inning' && (
                              <div className="flex rounded overflow-hidden border" style={{ borderColor: LINE }}>
                                {['top', 'bottom'].map(h => (
                                  <button key={h} onClick={() => setLiveForm(f => ({ ...f, half: h }))} className="px-2 py-1.5 text-xs font-bold capitalize" style={{ background: liveForm.half === h ? NEGATIVE : PANEL2, color: liveForm.half === h ? INK : CHALK_DIM }}>{h}</button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => { setGameOngoing(g.id, true, { away: Number(liveForm.away) || 0, home: Number(liveForm.home) || 0, period: Number(liveForm.period) || 1, half: liveForm.half }); setLiveEditingId(null); }} className="px-3 py-1.5 rounded font-bold text-xs flex items-center gap-1" style={{ background: NEGATIVE, color: INK }}><Activity size={12} /> {g.isOngoing ? 'Update' : 'Go live'}</button>
                            {g.isOngoing && <button onClick={() => { setGameOngoing(g.id, false); setLiveEditingId(null); }} className="px-3 py-1.5 rounded font-bold text-xs" style={{ background: PANEL2, color: CHALK_DIM, border: `1px solid ${LINE}` }}>End live</button>}
                            <button onClick={() => setLiveEditingId(null)} className="px-2 py-1.5 rounded text-xs" style={{ color: CHALK_DIM }}>Cancel</button>
                          </div>
                          <p className="text-[11px]" style={{ color: CHALK_DIM }}>Live score and {sport.period} are informational only — they don't count toward standings until you enter a final score with the pencil icon.</p>
                        </div>
                      )}
                      {editingId === g.id && (
                        <div className="px-3 pb-3 space-y-2" style={{ borderLeft: `3px solid ${awayColor}`, borderRight: `3px solid ${homeColor}` }}>
                          <div className="flex flex-wrap items-end gap-2">
                            <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>Away runs</div><NumInput value={scoreForm.away} onChange={v => setScoreForm(f => ({ ...f, away: v }))} /></div>
                            <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>Home runs</div><NumInput value={scoreForm.home} onChange={v => setScoreForm(f => ({ ...f, home: v }))} /></div>
                            <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>{sport.periodPlural.charAt(0).toUpperCase() + sport.periodPlural.slice(1)}</div><NumInput value={scoreForm.innings} onChange={v => setScoreForm(f => ({ ...f, innings: v }))} /></div>
                            <button onClick={() => { saveScore(g.id, { awayScore: Number(scoreForm.away), homeScore: Number(scoreForm.home), innings: Number(scoreForm.innings) || (settings.standardInnings || 7) }); setEditingId(null); }}
                              disabled={scoreForm.away === '' || scoreForm.home === ''} className="px-3 py-1.5 rounded font-bold text-xs flex items-center gap-1 disabled:opacity-40" style={{ background: PRIMARY, color: INK }}><Save size={13} /> Save</button>
                            <button onClick={() => setEditingId(null)} className="px-2 py-1.5 rounded text-xs" style={{ color: CHALK_DIM }}>Cancel</button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pt-1" style={{ borderTop: `1px solid ${LINE}` }}>
                            <span className="text-[10px] uppercase" style={{ color: CHALK_DIM }}>Forfeit:</span>
                            <button onClick={() => { if (confirm(`Declare a forfeit — ${away ? away.name : g.awayScheduleName} forfeits, ${home ? home.name : g.homeScheduleName} wins 9-0?`)) { declareForfeit(g.id, 'away'); setEditingId(null); } }}
                              className="px-2 py-1 rounded text-[11px] font-semibold" style={{ background: PANEL, color: NEGATIVE, border: `1px solid ${LINE}` }}>Away forfeits</button>
                            <button onClick={() => { if (confirm(`Declare a forfeit — ${home ? home.name : g.homeScheduleName} forfeits, ${away ? away.name : g.awayScheduleName} wins 9-0?`)) { declareForfeit(g.id, 'home'); setEditingId(null); } }}
                              className="px-2 py-1 rounded text-[11px] font-semibold" style={{ background: PANEL, color: NEGATIVE, border: `1px solid ${LINE}` }}>Home forfeits</button>
                          </div>
                          {g.played && (
                            <div className="flex flex-wrap items-center gap-2 pt-1" style={{ borderTop: `1px solid ${LINE}` }}>
                              <span className="text-[10px] uppercase" style={{ color: CHALK_DIM }}>Winner:</span>
                              <button onClick={() => setWinnerOverride(g.id, 'away')} className="px-2 py-1 rounded text-[11px] font-semibold" style={{ background: w === 'away' && g.winnerOverride ? PRIMARY : PANEL, color: w === 'away' && g.winnerOverride ? INK : CHALK, border: `1px solid ${LINE}` }}>{away ? away.name : 'Away'} won</button>
                              <button onClick={() => setWinnerOverride(g.id, 'home')} className="px-2 py-1 rounded text-[11px] font-semibold" style={{ background: w === 'home' && g.winnerOverride ? PRIMARY : PANEL, color: w === 'home' && g.winnerOverride ? INK : CHALK, border: `1px solid ${LINE}` }}>{home ? home.name : 'Home'} won</button>
                              {g.winnerOverride && <button onClick={() => setWinnerOverride(g.id, null)} className="px-2 py-1 rounded text-[11px]" style={{ color: CHALK_DIM }}>Use score instead</button>}
                            </div>
                          )}
                          <div className="flex items-center gap-2 pt-1" style={{ borderTop: `1px solid ${LINE}` }}>
                            <span className="text-[10px] uppercase flex-shrink-0" style={{ color: CHALK_DIM }}>Note:</span>
                            <input defaultValue={g.notes || ''} onBlur={e => updateGameNotes(g.id, e.target.value)} placeholder="e.g. walk-off, rain delay…" className="flex-1 bg-[#222D42] border rounded px-2 py-1 text-xs" style={{ borderColor: LINE, color: CHALK }} />
                          </div>
                        </div>
                      )}
                      {editingId !== g.id && g.notes && (
                        <div className="px-3 pb-2 text-[11px] italic" style={{ color: CHALK_DIM, borderLeft: `3px solid ${awayColor}`, borderRight: `3px solid ${homeColor}` }}>{g.notes}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY} right={isLoggedIn && <button onClick={() => setShowAdd(v => !v)} className="text-[11px] font-bold" style={{ color: PRIMARY }}>{showAdd ? 'Hide' : 'Add games'}</button>}>Add to schedule</SectionTitle>
        {showAdd && isLoggedIn && (
          <div className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <p className="text-xs" style={{ color: CHALK_DIM }}>Put a {labelWord.toLowerCase()} on its own line, then list that {labelWord.toLowerCase()}'s games underneath. Change this in the Settings tab.</p>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-semibold cursor-pointer" style={{ background: PANEL2, color: CHALK, border: `1px solid ${LINE}` }}>
                <Upload size={14} /> Choose .txt file
                <input type="file" accept=".txt,.csv" className="hidden" onChange={handleFile} />
              </label>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
                placeholder={scheduleMode === 'round' ? 'Round 1\nHeat @ Ospreys\nWolves @ Falcons\n\nRound 2\nOspreys @ Wolves' : 'April 5\nHeat @ Ospreys\nWolves @ Falcons\n\nApril 12\nOspreys @ Wolves'}
                className="w-full bg-[#222D42] border rounded px-3 py-2 text-sm font-mono" style={{ borderColor: LINE, color: CHALK }} />
              <button onClick={runPreview} disabled={!text.trim()} className="px-3 py-2 rounded font-bold text-sm disabled:opacity-40" style={{ background: PRIMARY, color: INK }}>Preview import</button>
              {preview && (
                <div className="mt-2 rounded-lg border" style={{ borderColor: LINE }}>
                  <div className="max-h-56 overflow-y-auto divide-y" style={{ borderColor: LINE }}>
                    {preview.map(r => r.isHeader ? (
                      <div key={r.rowId} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: PRIMARY, background: PANEL2 }}>{scheduleMode === 'round' ? formatRoundLabel(r.date) : r.date}</div>
                    ) : (
                      <div key={r.rowId} className="px-3 py-1.5 text-xs flex items-center gap-2">
                        {r.matched ? <Check size={12} style={{ color: PRIMARY }} /> : <X size={12} style={{ color: NEGATIVE }} />}
                        <span style={{ color: r.matched ? CHALK : CHALK_DIM }}>{r.matched ? `${r.away} @ ${r.home}${r.awayScore != null ? ` (${r.awayScore}-${r.homeScore})` : ''}` : `Unrecognized: "${r.raw}"`}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-xs" style={{ color: CHALK_DIM }}>
                    <span>{preview.filter(r => r.matched).length} of {preview.filter(r => !r.isHeader).length} lines recognized</span>
                    <div className="flex gap-2">
                      <button onClick={() => setPreview(null)} className="px-2 py-1 rounded" style={{ color: CHALK_DIM }}>Cancel</button>
                      <button onClick={confirmImport} className="px-3 py-1.5 rounded font-bold" style={{ background: PRIMARY, color: INK }}>Import games</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-end text-sm pt-2" style={{ borderTop: `1px solid ${LINE}` }}>
              <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>{labelWord}</div>
                <input value={manual.date} onChange={e => setManual(m => ({ ...m, date: e.target.value }))} placeholder={scheduleMode === 'round' ? '3' : 'Apr 12'} className="w-24 bg-[#222D42] border rounded px-2 py-1.5" style={{ borderColor: LINE, color: CHALK }} /></div>
              <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>Away</div>
                <select value={manual.awayTeamId} onChange={e => setManual(m => ({ ...m, awayTeamId: e.target.value }))} className="bg-[#222D42] border rounded px-2 py-1.5" style={{ borderColor: LINE, color: CHALK }}>
                  <option style={{ background: PANEL2, color: CHALK }} value="">Select</option>{season.members.map(m => <option style={{ background: PANEL2, color: CHALK }} key={m.teamId} value={m.teamId}>{teamsById[m.teamId]?.name || m.scheduleName}</option>)}
                </select></div>
              <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>Home</div>
                <select value={manual.homeTeamId} onChange={e => setManual(m => ({ ...m, homeTeamId: e.target.value }))} className="bg-[#222D42] border rounded px-2 py-1.5" style={{ borderColor: LINE, color: CHALK }}>
                  <option style={{ background: PANEL2, color: CHALK }} value="">Select</option>{season.members.map(m => <option style={{ background: PANEL2, color: CHALK }} key={m.teamId} value={m.teamId}>{teamsById[m.teamId]?.name || m.scheduleName}</option>)}
                </select></div>
              <button onClick={() => { if (manual.awayTeamId && manual.homeTeamId && manual.awayTeamId !== manual.homeTeamId) { addManualGame(manual); setManual({ date: '', awayTeamId: '', homeTeamId: '' }); } }} className="px-3 py-1.5 rounded font-bold flex items-center gap-1" style={{ background: PRIMARY, color: INK }}><Plus size={14} /> Add</button>
            </div>
          </div>
        )}
      </Panel>
      <RoundRobinGenerator season={season} teamsById={teamsById} generateSchedule={generateSchedule} />
      <ScheduleBalanceChecker season={season} teamsById={teamsById} />
    </div>
  );
}

/* ==================================================================== */
/* Stats view                                                            */
/* ==================================================================== */
function StatsView({ standings, onOpenTeam, season }) {
  const managerRanked = season ? standings.map(t => {
    const member = season.members.find(m => m.teamId === t.id);
    if (!member) return null;
    const pmPlayer = (member.roster || []).find(p => (p.role || '').trim().toUpperCase() === 'PM');
    const managerName = pmPlayer ? pmPlayer.name : member.managerName;
    if (!managerName) return null;
    return { managerName, team: t };
  }).filter(Boolean).sort((a, b) => b.team.pct - a.team.pct) : [];

  // Second-half surge: splits each team's games in half chronologically and
  // compares win% in each half — a different lens from Hot & Cold (which
  // only looks at the last 10) or Power Rankings (which is season-wide).
  const surgeRanked = standings.map(t => {
    const results = t.results || [];
    if (results.length < 6) return null;
    const mid = Math.floor(results.length / 2);
    const first = results.slice(0, mid), second = results.slice(mid);
    const firstW = first.filter(r => r === 'W').length, secondW = second.filter(r => r === 'W').length;
    const firstPct = firstW / first.length, secondPct = secondW / second.length;
    return { ...t, firstPct, secondPct, surge: secondPct - firstPct, firstRecord: `${firstW}-${first.length - firstW}`, secondRecord: `${secondW}-${second.length - secondW}` };
  }).filter(x => x && Math.abs(x.surge) > 0.15).sort((a, b) => b.surge - a.surge);

  const remainingByTeam = season ? computeRemaining(season) : {};
  const bestFinishRanked = standings.map(t => ({ t, bf: computeBestPossibleFinish(standings, t.id, remainingByTeam) }))
    .filter(x => x.bf && x.bf.remaining > 0 && x.bf.bestRank < x.bf.currentRank)
    .sort((a, b) => (a.bf.currentRank - a.bf.bestRank) === (b.bf.currentRank - b.bf.bestRank) ? a.bf.bestRank - b.bf.bestRank : (b.bf.currentRank - b.bf.bestRank) - (a.bf.currentRank - a.bf.bestRank));

  const powerRanked = [...standings].map(t => {
    const diffPerG = t.gp > 0 ? t.diff / t.gp : 0;
    const sosAdj = ((t.sos != null ? t.sos : 0.5) - 0.5) * 0.2;
    const power = t.pct + diffPerG * 0.1 + sosAdj;
    const rf2 = t.rf * t.rf, ra2 = t.ra * t.ra;
    const pythPct = (rf2 + ra2) > 0 ? rf2 / (rf2 + ra2) : 0.5;
    const pythW = pythPct * t.gp;
    const luck = t.w - pythW;
    return { ...t, power, pythW, pythL: t.gp - pythW, luck };
  }).sort((a, b) => b.power - a.power);

  // Clutch rating: how a team performs specifically in high-leverage, tight
  // games (decided by 1 run, or that went to extra innings/periods).
  const clutchRanked = [...standings].map(t => {
    const oneRunGp = t.oneRunW + t.oneRunL, xInnGp = t.xInnW + t.xInnL;
    const oneRunPct = oneRunGp > 0 ? t.oneRunW / oneRunGp : null;
    const xInnPct = xInnGp > 0 ? t.xInnW / xInnGp : null;
    const parts = [oneRunPct, xInnPct].filter(v => v != null);
    const clutch = parts.length ? (oneRunPct != null ? oneRunPct * 0.65 : 0) + (xInnPct != null ? xInnPct * 0.35 : 0) : null;
    return { ...t, clutch, oneRunGp, xInnGp };
  }).filter(t => t.clutch != null && (t.oneRunGp + t.xInnGp) > 0).sort((a, b) => b.clutch - a.clutch);

  // Hot/cold index: recent form (last 10) compared to season-long win%, so a
  // team playing above or below their overall level stands out.
  const formRanked = [...standings].map(t => {
    const l10w = t.last10.filter(r => r === 'W').length, l10gp = t.last10.length;
    const l10Pct = l10gp > 0 ? l10w / l10gp : null;
    const delta = l10Pct != null ? l10Pct - t.pct : null;
    return { ...t, l10Pct, delta, l10w, l10gp };
  }).filter(t => t.l10gp >= 5)
    // Sort by ABSOLUTE recent form first (a team on a losing streak should
    // never rank above a team on a winning one, no matter their season-long
    // baseline), then by the relative trend as a tiebreaker.
    .sort((a, b) => b.l10Pct - a.l10Pct || b.delta - a.delta);

  return (
    <div className="p-4 space-y-4">
      <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
        <SectionTitle accent={GOLD}>Power rankings</SectionTitle>
        <div className="px-2 pb-3">
          {powerRanked.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}`, borderLeft: `3px solid ${teamColor(t)}` }}>
              <span className="font-mono w-5 flex-shrink-0" style={{ color: CHALK_DIM }}>{i + 1}</span>
              <button onClick={() => onOpenTeam(t.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left" style={{ color: CHALK }}><TeamMark team={t} size={16} /> <span className="truncate">{t.displayName}</span></button>
              <span className="font-mono text-xs" style={{ color: t.luck > 0.5 ? WIN : t.luck < -0.5 ? NEGATIVE : CHALK_DIM }}>{t.luck > 0 ? `+${t.luck.toFixed(1)}` : t.luck.toFixed(1)} luck</span>
            </div>
          ))}
          {powerRanked.length === 0 && <p className="px-2 py-4 text-sm" style={{ color: CHALK_DIM }}>No teams yet.</p>}
        </div>
        <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Blends win%, run differential per game, and strength of schedule. "Luck" compares actual wins to Pythagorean expected wins (from runs scored/allowed) — positive means winning more than their run totals suggest.</p>
      </Panel>
      {clutchRanked.length > 0 && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Clutch rating</SectionTitle>
          <div className="px-2 pb-3">
            {clutchRanked.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}`, borderLeft: `3px solid ${teamColor(t)}` }}>
                <span className="font-mono w-5 flex-shrink-0" style={{ color: CHALK_DIM }}>{i + 1}</span>
                <button onClick={() => onOpenTeam(t.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left" style={{ color: CHALK }}><TeamMark team={t} size={16} /> <span className="truncate">{t.displayName}</span></button>
                <span className="font-mono text-xs" style={{ color: CHALK_DIM }}>{t.oneRunW}-{t.oneRunL} 1R · {t.xInnW}-{t.xInnL} XI</span>
              </div>
            ))}
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Ranked by winning percentage in 1-run games (weighted 65%) and extra-innings games (weighted 35%) — how teams perform when it's tight. Only includes teams with at least one such game.</p>
        </Panel>
      )}
      {formRanked.length > 0 && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Hot &amp; cold</SectionTitle>
          <div className="px-2 pb-3">
            {formRanked.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}`, borderLeft: `3px solid ${teamColor(t)}` }}>
                <span className="font-mono w-5 flex-shrink-0" style={{ color: CHALK_DIM }}>{i + 1}</span>
                <button onClick={() => onOpenTeam(t.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left" style={{ color: CHALK }}><TeamMark team={t} size={16} /> <span className="truncate">{t.displayName}</span></button>
                <span className="font-mono text-xs" style={{ color: CHALK_DIM }}>{t.l10w}-{t.l10gp - t.l10w} L10</span>
                <span className="font-mono text-xs font-bold" style={{ color: t.delta > 0.1 ? WIN : t.delta < -0.1 ? NEGATIVE : CHALK_DIM }}>{t.delta > 0 ? '+' : ''}{(t.delta * 100).toFixed(0)}pp</span>
              </div>
            ))}
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Ranked by last-10 record first (so a losing streak always sorts below a winning one, no matter the season-long record) — the +/- number is how that compares to their season-long win%, as a secondary trend signal.</p>
        </Panel>
      )}
      {bestFinishRanked.length > 0 && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Best possible finish</SectionTitle>
          <div className="px-2 pb-3">
            {bestFinishRanked.map(({ t, bf }) => (
              <div key={t.id} className="px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}`, borderLeft: `3px solid ${teamColor(t)}` }}>
                <div className="flex items-center gap-2">
                  <button onClick={() => onOpenTeam(t.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left" style={{ color: CHALK }}><TeamMark team={t} size={16} /> <span className="truncate">{t.displayName}</span></button>
                  <span className="font-mono text-xs" style={{ color: CHALK_DIM }}>#{bf.currentRank} →</span>
                  <span className="font-mono text-sm font-bold" style={{ color: WIN }}>#{bf.bestRank}</span>
                </div>
                <div className="text-[11px] pl-1 mt-0.5" style={{ color: CHALK_DIM }}>if they win out ({bf.remaining} left)</div>
              </div>
            ))}
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Only teams that could still climb are shown. A team's floor is its current win total — if that alone already beats a rival's ceiling, that rival is unreachable no matter what happens.</p>
        </Panel>
      )}
      {managerRanked.length > 0 && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Manager leaderboard</SectionTitle>
          <div className="px-2 pb-3">
            {managerRanked.map((m, i) => (
              <div key={m.team.id} className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}`, borderLeft: `3px solid ${teamColor(m.team)}` }}>
                <span className="font-mono w-5 flex-shrink-0" style={{ color: CHALK_DIM }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <button onClick={() => onOpenTeam(m.team.id)} className="truncate block text-left" style={{ color: CHALK }}>{m.managerName}</button>
                  <div className="text-[11px] truncate" style={{ color: CHALK_DIM }}>{m.team.displayName}</div>
                </div>
                <span className="font-mono text-xs" style={{ color: CHALK_DIM }}>{m.team.w}-{m.team.l}</span>
              </div>
            ))}
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Managers, ranked by their team's record — pulled from a roster PM slot if set, otherwise the manually entered name.</p>
        </Panel>
      )}
      {surgeRanked.length > 0 && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Second-half surge</SectionTitle>
          <div className="px-2 pb-3">
            {surgeRanked.map(t => (
              <div key={t.id} className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}`, borderLeft: `3px solid ${teamColor(t)}` }}>
                <button onClick={() => onOpenTeam(t.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left" style={{ color: CHALK }}><TeamMark team={t} size={16} /> <span className="truncate">{t.displayName}</span></button>
                <span className="font-mono text-xs" style={{ color: CHALK_DIM }}>{t.firstRecord} → {t.secondRecord}</span>
                <span className="font-mono text-xs font-bold" style={{ color: t.surge > 0 ? WIN : NEGATIVE }}>{t.surge > 0 ? '+' : ''}{(t.surge * 100).toFixed(0)}pp</span>
              </div>
            ))}
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Splits each team's games in half and compares win% in each — only shown for teams with at least a 15-point swing between the first and second half of their season.</p>
        </Panel>
      )}
      <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
        <SectionTitle accent={GOLD}>Advanced stats</SectionTitle>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="text-sm" style={{ color: CHALK }}>
            <thead><tr className="text-[10px] uppercase" style={{ color: CHALK_DIM }}>
              <th className="text-left px-2 py-1">Team</th><th className="px-2 py-1">Strk</th><th className="px-2 py-1">RS/G</th><th className="px-2 py-1">RA/G</th>
              <th className="px-2 py-1">SOS</th><th className="px-2 py-1">SOV</th><th className="px-2 py-1">1-Run</th><th className="px-2 py-1">X-Inn</th><th className="px-2 py-1">Def IP</th>
            </tr></thead>
            <tbody>
              {standings.map(t => (
                <tr key={t.id} style={{ borderTop: `1px solid ${LINE}` }}>
                  <td className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ borderLeft: `3px solid ${teamColor(t)}` }}><button onClick={() => onOpenTeam(t.id)} className="flex items-center gap-2 pl-1.5" style={{ color: CHALK }}><TeamMark team={t} size={16} /> <span className="truncate max-w-[110px]">{t.displayName}</span></button></td>
                  <td className="px-2 py-1.5 text-center font-mono" style={{ color: t.streak.type === 'W' ? WIN : t.streak.type === 'L' ? NEGATIVE : CHALK_DIM }}>{t.streak.label}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.rsPerG.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.raPerG.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.sos != null ? t.sos.toFixed(3).replace(/^0/, '') : '—'}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.sov != null ? t.sov.toFixed(3).replace(/^0/, '') : '—'}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.oneRunW}-{t.oneRunL}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.xInnW}-{t.xInnL}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.defInnings}</td>
                </tr>
              ))}
              {standings.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-sm" style={{ color: CHALK_DIM }}>No teams yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-2 text-[11px]" style={{ color: CHALK_DIM }}>SOV (strength of victory) averages the win% of opponents actually beaten — distinct from SOS, which averages every opponent played regardless of outcome.</p>
        <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>SOS is the average win% of every opponent on the schedule. Defensive innings approximates innings played on defense from each game's recorded length.</p>
      </Panel>
      <Panel>
        <SectionTitle>Home &amp; away splits</SectionTitle>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="text-sm" style={{ color: CHALK }}>
            <thead><tr className="text-[10px] uppercase" style={{ color: CHALK_DIM }}>
              <th className="text-left px-2 py-1">Team</th><th className="px-2 py-1">Home</th><th className="px-2 py-1">Away</th>
              <th className="px-2 py-1">Home RS/G</th><th className="px-2 py-1">Home RA/G</th><th className="px-2 py-1">Away RS/G</th><th className="px-2 py-1">Away RA/G</th>
            </tr></thead>
            <tbody>
              {standings.map(t => (
                <tr key={t.id} style={{ borderTop: `1px solid ${LINE}` }}>
                  <td className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ borderLeft: `3px solid ${teamColor(t)}` }}><button onClick={() => onOpenTeam(t.id)} className="flex items-center gap-2 pl-1.5" style={{ color: CHALK }}><TeamMark team={t} size={16} /> <span className="truncate max-w-[110px]">{t.displayName}</span></button></td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.homeW}-{t.homeL}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.awayW}-{t.awayL}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.homeRsPerG.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.homeRaPerG.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.awayRsPerG.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{t.awayRaPerG.toFixed(2)}</td>
                </tr>
              ))}
              {standings.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-sm" style={{ color: CHALK_DIM }}>No teams yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ==================================================================== */
/* Team page (season-scoped)                                             */
/* ==================================================================== */
function StarLevelBadge({ value, size = 12 }) {
  return <span className="font-mono font-bold" style={{ color: (value == null || value === 'R') ? CHALK_DIM : GOLD, fontSize: size }}>{formatStarLevel(value)}</span>;
}
function StarLevelEditor({ value, onChange, disabled = false }) {
  const isR = value == null || value === 'R';
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {!isR && <NumInput value={value} onChange={v => onChange(v)} w="w-14" allowDecimal step={0.5} min={0} disabled={disabled} />}
      <button type="button" disabled={disabled} onClick={() => onChange(isR ? 3 : null)} className="text-[10px] px-1.5 py-1 rounded font-bold flex-shrink-0 disabled:opacity-50" style={{ background: isR ? GOLD : PANEL, color: isR ? INK : CHALK_DIM, border: `1px solid ${LINE}` }}>R</button>
    </div>
  );
}

function RosterPanel({ member, color, updatePlayerField, removePlayer, addPlayer, addPlayersBulk, teamOptions, onTrade }) {
  const { isLoggedIn } = useAuth();
  const [name, setName] = useState('');
  const [starLevel, setStarLevel] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkPreview, setBulkPreview] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [tradingId, setTradingId] = useState(null);
  const roster = member.roster || [];

  return (
    <Panel className="overflow-hidden" style={{ borderColor: color }}>
      <SectionTitle accent={color} right={isLoggedIn && <button onClick={() => setShowBulk(v => !v)} className="text-[11px] font-semibold" style={{ color }}>{showBulk ? 'Hide import' : 'Import roster'}</button>}>Roster</SectionTitle>

      {showBulk && isLoggedIn && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-xs" style={{ color: CHALK_DIM }}>One player per line: <code>Name, Stars, Number, Position</code> — only name is required. Use "R" for unrated.</p>
          <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={4} placeholder={'Jordan Lee, 5.5, 24, SS\nSam Rivera, R, 8, OF'}
            className="w-full bg-[#222D42] border rounded px-3 py-2 text-sm font-mono" style={{ borderColor: LINE, color: CHALK }} />
          <button onClick={() => setBulkPreview(parseRosterText(bulkText))} disabled={!bulkText.trim()} className="px-3 py-1.5 rounded font-bold text-xs disabled:opacity-40" style={{ background: color, color: INK }}>Preview</button>
          {bulkPreview && (
            <div className="rounded-lg border" style={{ borderColor: LINE }}>
              <div className="max-h-40 overflow-y-auto divide-y" style={{ borderColor: LINE }}>
                {bulkPreview.map((r, i) => (
                  <div key={i} className="px-3 py-1.5 text-xs flex items-center gap-2">
                    {r.matched ? <Check size={12} style={{ color: WIN }} /> : <X size={12} style={{ color: NEGATIVE }} />}
                    <span style={{ color: r.matched ? CHALK : CHALK_DIM }}>{r.matched ? `${r.name}${r.number ? ` #${r.number}` : ''}${r.position ? ` (${r.position})` : ''} — ${formatStarLevel(r.starLevel)}` : 'Skipped (no name)'}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 px-3 py-2">
                <button onClick={() => { setBulkPreview(null); setBulkText(''); setShowBulk(false); }} className="text-xs" style={{ color: CHALK_DIM }}>Cancel</button>
                <button onClick={() => { addPlayersBulk(bulkPreview); setBulkPreview(null); setBulkText(''); setShowBulk(false); }} className="px-3 py-1.5 rounded font-bold text-xs" style={{ background: color, color: INK }}>Add {bulkPreview.filter(r => r.matched).length} players</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="px-2 pb-2">
        {roster.length === 0 && <p className="px-2 py-4 text-sm" style={{ color: CHALK_DIM }}>No players yet.</p>}
        {roster.map(p => {
          const isOpen = expandedId === p.id;
          return (
            <div key={p.id} className="mb-2 rounded-lg" style={{ background: PANEL2, border: `1px solid ${LINE}` }}>
              <div className="flex items-center gap-2 px-3 py-2">
                <button onClick={() => setExpandedId(isOpen ? null : p.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                  {p.role && <span className="text-[10px] font-mono px-1 rounded flex-shrink-0" style={{ background: PANEL, color: CHALK_DIM }}>{p.role}</span>}
                  <span className="text-sm font-semibold truncate" style={{ color: CHALK }}>{p.name}</span>
                  {p.number && <span className="text-xs font-mono flex-shrink-0" style={{ color: CHALK_DIM }}>#{p.number}</span>}
                </button>
                <StarLevelEditor value={p.starLevel} onChange={v => updatePlayerField(p.id, 'starLevel', v)} disabled={!isLoggedIn} />
                <button onClick={() => setExpandedId(isOpen ? null : p.id)} className="p-1 flex-shrink-0" style={{ color: CHALK_DIM }}><ChevronRight size={14} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} /></button>
              </div>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2" style={{ borderTop: `1px solid ${LINE}` }}>
                  <fieldset disabled={!isLoggedIn} className="contents">
                  <div className="flex flex-wrap gap-2 pt-2">
                    <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>Role/slot</div><input value={p.role || ''} onChange={e => updatePlayerField(p.id, 'role', e.target.value)} className="w-16 bg-[#222D42] border rounded px-2 py-1 text-xs" style={{ borderColor: LINE, color: CHALK }} /></div>
                    <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>#</div><input value={p.number} onChange={e => updatePlayerField(p.id, 'number', e.target.value)} className="w-14 bg-[#222D42] border rounded px-2 py-1 text-xs" style={{ borderColor: LINE, color: CHALK }} /></div>
                    <div><div className="text-[10px] uppercase mb-1" style={{ color: CHALK_DIM }}>Position</div><input value={p.position} onChange={e => updatePlayerField(p.id, 'position', e.target.value)} className="w-20 bg-[#222D42] border rounded px-2 py-1 text-xs" style={{ borderColor: LINE, color: CHALK }} /></div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {teamOptions && teamOptions.length > 0 && (
                      <button onClick={() => setTradingId(tradingId === p.id ? null : p.id)} className="text-xs flex items-center gap-1" style={{ color: PRIMARY }}><RefreshCw size={13} /> Trade</button>
                    )}
                    <button onClick={() => { if (confirm(`Remove ${p.name} from the roster?`)) removePlayer(p.id); }} className="text-xs flex items-center gap-1" style={{ color: NEGATIVE }}><Trash2 size={13} /> Remove</button>
                  </div>
                  </fieldset>
                  {tradingId === p.id && teamOptions && (
                    <div className="pt-1" style={{ borderTop: `1px solid ${LINE}` }}>
                      <div className="text-[10px] uppercase mb-1.5 mt-2" style={{ color: CHALK_DIM }}>Trade {p.name} to:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {teamOptions.map(t => (
                          <button key={t.id} onClick={() => { onTrade(t.id, p.id); setTradingId(null); setExpandedId(null); }} className="text-xs px-2 py-1 rounded font-semibold" style={{ background: PANEL, color: CHALK, border: `1px solid ${LINE}` }}>{t.name}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isLoggedIn && (
      <div className="px-4 pb-4 flex items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Player name" className="flex-1 bg-[#222D42] border rounded px-3 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }} />
        <StarLevelEditor value={starLevel} onChange={setStarLevel} />
        <button onClick={() => { if (name.trim()) { addPlayer(name.trim(), starLevel); setName(''); setStarLevel(null); } }} className="px-3 py-2 rounded font-bold text-sm flex-shrink-0" style={{ background: color, color: INK }}><Plus size={16} /></button>
      </div>
      )}
    </Panel>
  );
}

function TeamPage({ season, settings, team, standingsRow, teamsById, h2hMatrix, championshipCount, onBack, onOpenGlobalHistory, onOpenCompare, updatePlayerField, removePlayer, addPlayer, addPlayersBulk, tradePlayer, updateMemberField }) {
  const { isLoggedIn } = useAuth();
  if (!team) return <div className="p-4"><button onClick={onBack} className="flex items-center gap-1 text-sm mb-3" style={{ color: CHALK_DIM }}><ArrowLeft size={14} /> Back</button><Panel><p className="px-4 py-8 text-sm text-center" style={{ color: CHALK_DIM }}>That team could not be found.</p></Panel></div>;
  const color = teamColor(team);
  const games = sortGamesChronologically((season.games || []).filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id), (season.settings && season.settings.scheduleMode) || 'date');
  const last10Record = standingsRow ? `${standingsRow.last10.filter(r => r === 'W').length}-${standingsRow.last10.filter(r => r === 'L').length}` : '0-0';
  const member = season.members.find(m => m.teamId === team.id) || {};
  const pmPlayer = (member.roster || []).find(p => (p.role || '').trim().toUpperCase() === 'PM');
  const managerName = pmPlayer ? pmPlayer.name : member.managerName;
  const fullStandings = useMemo(() => computeStandings(season, teamsById).active, [season, teamsById]);
  const bestFinish = useMemo(() => computeBestPossibleFinish(fullStandings, team.id, computeRemaining(season)), [fullStandings, team.id, season]);

  // Next scheduled game + a quick win-probability read, matching how the
  // Odds tab computes single-game odds (no home-field boost — that's only
  // applied inside playoff series simulations).
  const nextGame = games.find(g => !g.played && !g.isPlayoff && !g.isPlayIn);
  let nextGameInfo = null;
  if (nextGame) {
    const isHome = nextGame.homeTeamId === team.id;
    const oppId = isHome ? nextGame.awayTeamId : nextGame.homeTeamId;
    const me = fullStandings.find(t => t.id === team.id);
    const opp = fullStandings.find(t => t.id === oppId);
    const oppTeam = teamsById[oppId];
    if (me && opp) {
      const h2h = h2hRecord(h2hMatrix, isHome ? me.id : opp.id, isHome ? opp.id : me.id);
      const pHomeSide = winProb(isHome ? me : opp, isHome ? opp : me, h2h);
      const myOdds = (isHome ? pHomeSide : 1 - pHomeSide) * 100;
      nextGameInfo = { isHome, oppTeam, myOdds, date: nextGame.date };
    }
  }

  const opponentIds = [...new Set(season.members.filter(m => m.teamId !== team.id).map(m => m.teamId))];
  const h2hRows = opponentIds.map(oid => {
    const rec = h2hMatrix[team.id] && h2hMatrix[team.id][oid];
    if (!rec || rec.w + rec.l === 0) return null;
    const opp = teamsById[oid];
    return { id: oid, name: opp ? opp.name : (season.members.find(m => m.teamId === oid) || {}).scheduleName || 'Unknown', w: rec.w, l: rec.l, diff: rec.rf - rec.ra };
  }).filter(Boolean).sort((a, b) => (b.w - b.l) - (a.w - a.l));

  let bestWin = null, worstLoss = null;
  games.forEach(g => {
    if (!g.played || g.isForfeit) return;
    const isHome = g.homeTeamId === team.id;
    const my = isHome ? g.homeScore : g.awayScore, opp = isHome ? g.awayScore : g.homeScore;
    const w = gameWinner(g);
    const won = (isHome && w === 'home') || (!isHome && w === 'away');
    const margin = my - opp;
    if (won && (!bestWin || margin > bestWin.margin)) bestWin = { g, margin, isHome };
    if (!won && w != null && (!worstLoss || margin < worstLoss.margin)) worstLoss = { g, margin, isHome };
  });
  const nameForOpp = (g, isHome) => {
    const oppId = isHome ? g.awayTeamId : g.homeTeamId;
    return teamsById[oppId]?.name || (isHome ? g.awayScheduleName : g.homeScheduleName);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: CHALK_DIM }}><ArrowLeft size={14} /> Back</button>
        <div className="flex items-center gap-3">
          <button onClick={() => onOpenCompare(team.id)} className="flex items-center gap-1 text-xs font-semibold" style={{ color }}><BarChart3 size={13} /> Compare</button>
          <button onClick={() => onOpenGlobalHistory(team.id)} className="flex items-center gap-1 text-xs font-semibold" style={{ color }}><History size={13} /> Full history</button>
        </div>
      </div>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: color }}>
        <div className="p-4 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${color}33, ${PANEL} 70%)`, borderBottom: `2px solid ${color}` }}>
          {team.logoUrl
            ? <img src={team.logoUrl} alt="" className="w-14 h-14 object-contain flex-shrink-0 rounded-xl" style={{ boxShadow: `0 0 0 2px ${color}` }} />
            : team.mascot
              ? <div className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center text-3xl" style={{ background: `${color}33`, boxShadow: `0 0 0 2px ${color}` }}>{team.mascot}</div>
              : <div className="w-14 h-14 rounded-xl flex-shrink-0" style={{ background: color }} />}
          <div className="flex-1 min-w-0">
            {team.wordmarkUrl ? <img src={team.wordmarkUrl} alt="" className="max-h-8 max-w-full object-contain" /> : <h2 className="text-xl font-black truncate" style={{ color: CHALK }}>{team.displayName}</h2>}
            {managerName && <p className="text-xs mt-0.5" style={{ color: CHALK_DIM }}>Managed by {managerName}</p>}
            {standingsRow && <p className="text-sm font-mono mt-1" style={{ color }}>{standingsRow.w}-{standingsRow.l} ({standingsRow.pct.toFixed(3).replace(/^0/, '')}) · Rank #{standingsRow.rank}{standingsRow.gb > 0 ? ` · ${standingsRow.gb.toFixed(1)} GB` : ''}</p>}
            {championshipCount > 0 && (
              <p className="flex items-center gap-1 text-xs font-bold mt-1" style={{ color: GOLD }}>
                <Crown size={13} /> {championshipCount} league championship{championshipCount === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>
        {standingsRow && standingsRow.gp > 0 && (
          <p className="px-4 py-2.5 text-xs italic" style={{ color: CHALK_DIM, borderTop: `1px solid ${LINE}` }}>{generatePressQuote(standingsRow)}</p>
        )}
      </div>

      {nextGameInfo && (
        <Panel className="overflow-hidden" style={{ borderColor: color }}>
          <SectionTitle accent={color}>Next game</SectionTitle>
          <div className="px-4 pb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm" style={{ color: CHALK }}>{nextGameInfo.isHome ? 'vs' : '@'}</span>
              {nextGameInfo.oppTeam && <TeamMark team={nextGameInfo.oppTeam} size={20} />}
              <span className="text-sm font-semibold truncate" style={{ color: CHALK }}>{nextGameInfo.oppTeam ? nextGameInfo.oppTeam.name : 'TBD'}</span>
              {nextGameInfo.date && <span className="text-xs flex-shrink-0" style={{ color: CHALK_DIM }}>{nextGameInfo.date}</span>}
            </div>
            <span className="font-mono text-sm font-bold flex-shrink-0" style={{ color: nextGameInfo.myOdds >= 50 ? WIN : CHALK_DIM }}>{nextGameInfo.myOdds.toFixed(0)}%</span>
          </div>
        </Panel>
      )}

      {standingsRow && (
        <>
          <Panel className="overflow-hidden" style={{ borderColor: color }}>
            <SectionTitle accent={color}>Record</SectionTitle>
            <div className="grid grid-cols-3 gap-px" style={{ background: LINE }}>
              <StatBox label="Streak" value={standingsRow.streak.label} color={standingsRow.streak.type === 'W' ? WIN : standingsRow.streak.type === 'L' ? NEGATIVE : CHALK} />
              <StatBox label="Last 10" value={last10Record} />
              <StatBox label="Strength of Sched." value={standingsRow.sos != null ? standingsRow.sos.toFixed(3).replace(/^0/, '') : '—'} />
              <StatBox label="Home Record" value={`${standingsRow.homeW}-${standingsRow.homeL}`} />
              <StatBox label="Away Record" value={`${standingsRow.awayW}-${standingsRow.awayL}`} />
              <StatBox label="1-Run Games" value={`${standingsRow.oneRunW}-${standingsRow.oneRunL}`} />
            </div>
            {(() => {
              const gamesLeft = games.filter(g => !g.played && !g.isPlayoff && !g.isPlayIn).length;
              if (gamesLeft === 0 || standingsRow.gp === 0) return null;
              const paceWins = Math.round(standingsRow.pct * (standingsRow.gp + gamesLeft));
              return (
                <p className="px-4 py-2 text-xs" style={{ color: CHALK_DIM, borderTop: `1px solid ${LINE}` }}>
                  {gamesLeft} game{gamesLeft === 1 ? '' : 's'} remaining — on pace for about <span className="font-bold" style={{ color }}>{paceWins} wins</span> at the current rate.
                </p>
              );
            })()}
            {bestFinish && bestFinish.remaining > 0 && (
              <div className="px-4 py-2 text-xs" style={{ color: CHALK_DIM, borderTop: `1px solid ${LINE}` }}>
                <span>Best possible finish: </span>
                <span className="font-bold" style={{ color: bestFinish.bestRank < bestFinish.currentRank ? WIN : CHALK }}>#{bestFinish.bestRank}</span>
                <span> — win out ({bestFinish.remaining} game{bestFinish.remaining === 1 ? '' : 's'}, {bestFinish.maxWins} wins)</span>
                {bestFinish.lockedAhead.length > 0 && <span>{`, with ${bestFinish.lockedAhead.map(o => o.displayName).join(', ')} mathematically unreachable no matter what`}</span>}
                {bestFinish.catchable.length > 0 && <span>{` — ${bestFinish.catchable.map(o => o.displayName).join(', ')} would also need to slip.`}</span>}
                {bestFinish.catchable.length === 0 && bestFinish.lockedAhead.length === 0 && <span>.</span>}
              </div>
            )}
          </Panel>
          <Panel className="overflow-hidden" style={{ borderColor: color }}>
            <SectionTitle accent={color}>Scoring</SectionTitle>
            <div className="grid grid-cols-3 gap-px" style={{ background: LINE }}>
              <StatBox label="RS / Game" value={standingsRow.rsPerG.toFixed(2)} />
              <StatBox label="RA / Game" value={standingsRow.raPerG.toFixed(2)} />
              <StatBox label="Run Diff" value={standingsRow.diff > 0 ? `+${standingsRow.diff}` : standingsRow.diff} color={standingsRow.diff > 0 ? WIN : standingsRow.diff < 0 ? NEGATIVE : CHALK} />
              <StatBox label="Home RS/G" value={standingsRow.homeRsPerG.toFixed(2)} />
              <StatBox label="Away RS/G" value={standingsRow.awayRsPerG.toFixed(2)} />
              <StatBox label="Def. Innings" value={standingsRow.defInnings} />
            </div>
          </Panel>
          <Panel className="overflow-hidden" style={{ borderColor: color }}>
            <SectionTitle accent={color}>Trends &amp; situational</SectionTitle>
            <div className="grid grid-cols-3 gap-px" style={{ background: LINE }}>
              <StatBox label="Longest Win Streak" value={standingsRow.longestWinStreak} color={WIN} />
              <StatBox label="Longest Skid" value={standingsRow.longestLossStreak} color={NEGATIVE} />
              <StatBox label="Extra Innings" value={`${standingsRow.xInnW}-${standingsRow.xInnL}`} />
              <StatBox label="Forfeit Record" value={`${standingsRow.forfeitW || 0}-${standingsRow.forfeitL || 0}`} />
            </div>
          </Panel>
          {(bestWin || worstLoss) && (
            <Panel className="overflow-hidden" style={{ borderColor: color }}>
              <SectionTitle accent={color}>Notable games</SectionTitle>
              <div className="px-4 pb-4 space-y-2 text-sm">
                {bestWin && <p style={{ color: CHALK }}><span style={{ color: WIN }} className="font-bold">Best win:</span> {bestWin.margin > 0 ? `+${bestWin.margin}` : bestWin.margin} vs {nameForOpp(bestWin.g, bestWin.isHome)}{bestWin.g.date ? ` (${bestWin.g.date})` : ''}</p>}
                {worstLoss && <p style={{ color: CHALK }}><span style={{ color: NEGATIVE }} className="font-bold">Worst loss:</span> {worstLoss.margin} vs {nameForOpp(worstLoss.g, worstLoss.isHome)}{worstLoss.g.date ? ` (${worstLoss.g.date})` : ''}</p>}
              </div>
            </Panel>
          )}
        </>
      )}

      <RosterPanel member={member} color={color} updatePlayerField={(pid, f, v) => updatePlayerField(team.id, pid, f, v)} removePlayer={(pid) => removePlayer(team.id, pid)} addPlayer={(n, s) => addPlayer(team.id, n, s)} addPlayersBulk={(rows) => addPlayersBulk(team.id, rows)} teamOptions={season.members.filter(m => m.teamId !== team.id).map(m => ({ id: m.teamId, name: (teamsById[m.teamId] && teamsById[m.teamId].name) || m.scheduleName || 'Unknown team' }))} onTrade={(toTeamId, playerId) => tradePlayer(team.id, toTeamId, playerId)} />

      <Panel className="overflow-hidden" style={{ borderColor: color }}>
        <SectionTitle accent={color} right={
          <select value={member.rivalTeamId || ''} onChange={e => updateMemberField(team.id, 'rivalTeamId', e.target.value || null)} disabled={!isLoggedIn} className="bg-[#222D42] border rounded px-2 py-1 text-[11px] disabled:opacity-50" style={{ borderColor: LINE, color: CHALK }}>
            <option style={{ background: PANEL2, color: CHALK }} value="">No rival set</option>
            {season.members.filter(m => m.teamId !== team.id).map(m => <option style={{ background: PANEL2, color: CHALK }} key={m.teamId} value={m.teamId}>Rival: {(teamsById[m.teamId] && teamsById[m.teamId].name) || m.scheduleName}</option>)}
          </select>
        }>Head-to-head</SectionTitle>
        <div className="px-2 pb-3">
          {h2hRows.length === 0 && <p className="px-2 py-3 text-sm" style={{ color: CHALK_DIM }}>No games played against anyone yet this season.</p>}
          {h2hRows.map(r => {
            const isRival = member.rivalTeamId === r.id;
            return (
              <div key={r.id} className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}`, background: isRival ? `${GOLD}18` : 'transparent' }}>
                {isRival && <Sparkles size={12} style={{ color: GOLD, flexShrink: 0 }} />}
                <span className="flex-1 truncate" style={{ color: isRival ? GOLD : CHALK }}>{r.name}</span>
                <span className="font-mono text-xs" style={{ color: r.w >= r.l ? WIN : NEGATIVE }}>{r.w}-{r.l}</span>
                <span className="font-mono text-xs w-14 text-right" style={{ color: CHALK_DIM }}>{r.diff > 0 ? `+${r.diff}` : r.diff} rd</span>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="overflow-hidden" style={{ borderColor: color }}>
        <SectionTitle accent={color}>Schedule &amp; results</SectionTitle>
        <div className="px-2 pb-3 max-h-[440px] overflow-y-auto">
          {games.length === 0 && <p className="px-2 py-4 text-sm" style={{ color: CHALK_DIM }}>No games scheduled for this team.</p>}
          {games.map(g => {
            const isHome = g.homeTeamId === team.id;
            const oppId = isHome ? g.awayTeamId : g.homeTeamId;
            const oppTeam = teamsById[oppId];
            const oppName = oppTeam ? oppTeam.name : (isHome ? g.awayScheduleName : g.homeScheduleName);
            const myScore = isHome ? g.homeScore : g.awayScore, oppScore = isHome ? g.awayScore : g.homeScore;
            const w = gameWinner(g);
            const won = g.played && ((isHome && w === 'home') || (!isHome && w === 'away'));
            const lost = g.played && w != null && !won;
            return (
              <div key={g.id} className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}`, borderLeft: `3px solid ${color}` }}>
                <span className="text-[11px] w-16 flex-shrink-0 truncate" style={{ color: CHALK_DIM }}>{g.isPlayoff ? g.date : (settings.scheduleMode === 'round' && g.date ? formatRoundLabel(g.date) : (g.date || '—'))}</span>
                <span className="w-6 flex-shrink-0 text-[11px]" style={{ color: CHALK_DIM }}>{isHome ? 'vs' : '@'}</span>
                <span className="flex-1 truncate">{oppName}</span>
                {g.played
                  ? <span className="font-mono text-xs px-2 py-0.5 rounded font-bold" style={{ background: won ? 'rgba(45,212,191,0.15)' : lost ? 'rgba(251,113,102,0.15)' : 'transparent', color: won ? WIN : lost ? NEGATIVE : CHALK_DIM }}>{won ? 'W' : lost ? 'L' : 'T'} {myScore}-{oppScore}{g.isForfeit ? ' (F)' : ''}{g.winnerOverride ? ' *' : ''}</span>
                  : <span className="text-[11px]" style={{ color: CHALK_DIM }}>upcoming</span>}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ==================================================================== */
/* Team comparison page                                                  */
/* ==================================================================== */
function CompareStatRow({ label, aVal, bVal, aBetter, bBetter, aColor, bColor }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}` }}>
      <span className="w-16 flex-shrink-0 text-right font-mono font-bold" style={{ color: aBetter ? aColor : CHALK_DIM }}>{aVal}</span>
      <span className="flex-1 text-center text-[10px] uppercase tracking-wide" style={{ color: CHALK_DIM }}>{label}</span>
      <span className="w-16 flex-shrink-0 font-mono font-bold" style={{ color: bBetter ? bColor : CHALK_DIM }}>{bVal}</span>
    </div>
  );
}

function ComparePage({ season, standingsAll, teamsById, h2hMatrix, initialTeamId, onBack, onOpenTeam }) {
  const [aId, setAId] = useState(initialTeamId || (season.members[0] && season.members[0].teamId) || '');
  const [bId, setBId] = useState((season.members.find(m => m.teamId !== initialTeamId) || {}).teamId || '');
  const teamA = standingsAll.find(t => t.id === aId);
  const teamB = standingsAll.find(t => t.id === bId);
  const colorA = teamA ? teamColor(teamA) : PRIMARY, colorB = teamB ? teamColor(teamB) : NEGATIVE;
  const h2h = aId && bId ? (h2hMatrix[aId] && h2hMatrix[aId][bId]) : null;

  return (
    <div className="p-4 space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: CHALK_DIM }}><ArrowLeft size={14} /> Back</button>
      <Panel>
        <SectionTitle>Team comparison</SectionTitle>
        <div className="px-4 pb-4 flex items-center gap-2">
          <select value={aId} onChange={e => setAId(e.target.value)} className="flex-1 bg-[#222D42] border rounded px-2 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }}>
            {season.members.map(m => <option style={{ background: PANEL2, color: CHALK }} key={m.teamId} value={m.teamId}>{teamsById[m.teamId]?.name || m.scheduleName}</option>)}
          </select>
          <span className="text-xs font-bold" style={{ color: CHALK_DIM }}>VS</span>
          <select value={bId} onChange={e => setBId(e.target.value)} className="flex-1 bg-[#222D42] border rounded px-2 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }}>
            {season.members.map(m => <option style={{ background: PANEL2, color: CHALK }} key={m.teamId} value={m.teamId}>{teamsById[m.teamId]?.name || m.scheduleName}</option>)}
          </select>
        </div>
      </Panel>
      {teamA && teamB && (
        <>
          <div className="rounded-xl overflow-hidden flex" style={{ border: `1px solid ${LINE}` }}>
            <button onClick={() => onOpenTeam(teamA.id)} className="flex-1 p-3 flex items-center gap-2" style={{ background: `${colorA}22` }}>
              <TeamMark team={teamA} size={22} /> <span className="font-bold truncate" style={{ color: CHALK }}>{teamA.displayName}</span>
            </button>
            <button onClick={() => onOpenTeam(teamB.id)} className="flex-1 p-3 flex items-center justify-end gap-2" style={{ background: `${colorB}22` }}>
              <span className="font-bold truncate" style={{ color: CHALK }}>{teamB.displayName}</span> <TeamMark team={teamB} size={22} />
            </button>
          </div>
          <Panel>
            <div className="py-2">
              <CompareStatRow label="Record" aVal={`${teamA.w}-${teamA.l}`} bVal={`${teamB.w}-${teamB.l}`} aBetter={teamA.pct > teamB.pct} bBetter={teamB.pct > teamA.pct} aColor={colorA} bColor={colorB} />
              <CompareStatRow label="Win %" aVal={teamA.pct.toFixed(3).replace(/^0/, '')} bVal={teamB.pct.toFixed(3).replace(/^0/, '')} aBetter={teamA.pct > teamB.pct} bBetter={teamB.pct > teamA.pct} aColor={colorA} bColor={colorB} />
              <CompareStatRow label="Run Diff" aVal={teamA.diff > 0 ? `+${teamA.diff}` : teamA.diff} bVal={teamB.diff > 0 ? `+${teamB.diff}` : teamB.diff} aBetter={teamA.diff > teamB.diff} bBetter={teamB.diff > teamA.diff} aColor={colorA} bColor={colorB} />
              <CompareStatRow label="RS/Game" aVal={teamA.rsPerG.toFixed(2)} bVal={teamB.rsPerG.toFixed(2)} aBetter={teamA.rsPerG > teamB.rsPerG} bBetter={teamB.rsPerG > teamA.rsPerG} aColor={colorA} bColor={colorB} />
              <CompareStatRow label="RA/Game" aVal={teamA.raPerG.toFixed(2)} bVal={teamB.raPerG.toFixed(2)} aBetter={teamA.raPerG < teamB.raPerG} bBetter={teamB.raPerG < teamA.raPerG} aColor={colorA} bColor={colorB} />
              <CompareStatRow label="Streak" aVal={teamA.streak.label} bVal={teamB.streak.label} aBetter={teamA.streak.type === 'W'} bBetter={teamB.streak.type === 'W'} aColor={colorA} bColor={colorB} />
              <CompareStatRow label="Strength of Sched." aVal={teamA.sos != null ? teamA.sos.toFixed(3).replace(/^0/, '') : '—'} bVal={teamB.sos != null ? teamB.sos.toFixed(3).replace(/^0/, '') : '—'} aBetter={(teamA.sos || 0) > (teamB.sos || 0)} bBetter={(teamB.sos || 0) > (teamA.sos || 0)} aColor={colorA} bColor={colorB} />
              <CompareStatRow label="Home Record" aVal={`${teamA.homeW}-${teamA.homeL}`} bVal={`${teamB.homeW}-${teamB.homeL}`} aBetter={false} bBetter={false} aColor={colorA} bColor={colorB} />
              <CompareStatRow label="Away Record" aVal={`${teamA.awayW}-${teamA.awayL}`} bVal={`${teamB.awayW}-${teamB.awayL}`} aBetter={false} bBetter={false} aColor={colorA} bColor={colorB} />
            </div>
          </Panel>
          <Panel>
            <SectionTitle>Head-to-head</SectionTitle>
            {h2h && (h2h.w + h2h.l) > 0 ? (
              <div className="px-4 pb-4 text-sm" style={{ color: CHALK }}>
                <p>{teamA.displayName} leads the season series <span className="font-mono font-bold">{h2h.w}-{h2h.l}</span>, run differential <span className="font-mono font-bold">{h2h.rf - h2h.ra > 0 ? `+${h2h.rf - h2h.ra}` : h2h.rf - h2h.ra}</span>.</p>
              </div>
            ) : (
              <p className="px-4 pb-4 text-sm" style={{ color: CHALK_DIM }}>These teams haven't played each other yet this season.</p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/* ==================================================================== */
/* Odds view (bracket, magic/elim numbers, sim, h2h odds)                */
/* ==================================================================== */
const FUTURES_CATEGORY_META = {
  finish: { icon: Layers, label: 'Standings', color: PRIMARY },
  playoffs: { icon: AwardIcon, label: 'Playoffs', color: PRIMARY },
  champion: { icon: Crown, label: 'Championship', color: GOLD },
  streak: { icon: Activity, label: 'Streak Watch', color: NEGATIVE },
  nextgame: { icon: Calendar, label: 'Next Game', color: PRIMARY },
  sweep: { icon: Sparkles, label: 'Season Series', color: PRIMARY },
  headtohead: { icon: Users, label: 'Head-to-Head', color: PRIMARY },
};
function futuresConfidenceLabel(pct) {
  const d = Math.abs(pct - 50);
  if (d < 5) return 'Coin flip';
  if (d < 15) return 'Slight lean';
  if (d < 25) return 'Lean';
  return 'Strong lean';
}
function FutureCard({ f, oddsFormat, decimals }) {
  const meta = FUTURES_CATEGORY_META[f.category] || { icon: Percent, label: 'Futures', color: PRIMARY };
  const Icon = meta.icon;
  return (
    <div className="rounded-xl p-3.5" style={{ background: PANEL2, border: `1px solid ${LINE}` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Icon size={12} style={{ color: meta.color }} />
          <span className="text-[10px] uppercase font-bold tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
        </div>
        <span className="text-[10px]" style={{ color: CHALK_DIM }}>{futuresConfidenceLabel(f.pct)}</span>
      </div>
      <p className="text-sm mb-3 leading-snug" style={{ color: CHALK }}>{f.text}</p>
      <div className="flex items-center gap-3">
        <div className="flex-1 rounded-full overflow-hidden" style={{ background: LINE, height: 6 }}>
          <div style={{ width: `${f.pct}%`, height: '100%', background: f.pct >= 50 ? WIN : GOLD, borderRadius: 999 }} />
        </div>
        <span className="font-mono text-sm font-bold flex-shrink-0" style={{ color: f.pct >= 50 ? WIN : GOLD, minWidth: 40, textAlign: 'right' }}>{f.pct.toFixed(0)}%</span>
        <span className="font-mono text-xs flex-shrink-0" style={{ color: CHALK_DIM, minWidth: 46, textAlign: 'right' }}>{toAmericanOdds(f.pct)}</span>
      </div>
    </div>
  );
}

function FuturesPanel({ season, standings, teamsById, settings, h2hMatrix }) {
  const [pool, setPool] = useState(null);
  const [computing, setComputing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const rounds = useMemo(() => getOrderedRounds(season), [season]);
  const roundIdx = useMemo(() => currentRoundIndex(rounds), [rounds]);
  const roundLabel = rounds[roundIdx] ? rounds[roundIdx].label : 'preseason';
  const playedCount = (season.games || []).filter(g => g.played).length;

  useEffect(() => {
    setComputing(true);
    const t = setTimeout(() => {
      const seasonSimRaw = standings.length >= 2 ? runSimulation(season, teamsById, 300, settings.playoffSpots, h2hMatrix) : null;
      const playInWinnerId = getPlayInWinner((season.games || []).filter(g => g.isPlayIn));
      const seededStandings = buildMainBracketSeeds(standings, settings, playInWinnerId);
      const playoffSimRaw = standings.length >= 2 ? simulatePlayoffs(seededStandings, settings.playoffSpots, settings, h2hMatrix, 300, settings.homeFieldBoost || 0, (season.games || []).filter(g => g.isPlayoff)) : null;
      setPool(computeFuturesPool(season, standings, settings, seasonSimRaw, playoffSimRaw, h2hMatrix));
      setComputing(false);
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season.id, playedCount, roundLabel]);
  useEffect(() => { setNonce(0); }, [roundLabel, season.id]);

  const selected = pool ? selectRoundFutures(pool, season.id, roundLabel, 5, nonce, 2) : [];
  const oddsFormat = settings.oddsFormat || 'percent';
  const decimals = settings.oddsDecimals ?? 1;

  return (
    <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
      <SectionTitle accent={PRIMARY} right={
        computing ? <span className="text-[11px]" style={{ color: CHALK_DIM }}>Computing…</span> :
          <button onClick={() => setNonce(n => n + 1)} className="text-[11px] font-bold flex items-center gap-1" style={{ color: PRIMARY }}><RefreshCw size={12} /> Regenerate</button>
      }>Futures board</SectionTitle>
      <p className="px-4 pb-3 text-xs" style={{ color: CHALK_DIM }}>A fresh line-up of odds-based questions each round, all kept between {FUTURES_MIN_PCT}-{FUTURES_MAX_PCT}% so they're genuine toss-ups. Recomputes automatically as games get played and the round advances, or tap Regenerate for a different set right now.</p>
      <div className="px-3 pb-4 space-y-2.5">
        {!pool && <p className="px-2 py-4 text-sm" style={{ color: CHALK_DIM }}>Computing this round's futures…</p>}
        {pool && selected.length === 0 && <p className="px-2 py-4 text-sm" style={{ color: CHALK_DIM }}>Not enough close races yet for meaningful futures — check back after a few more games.</p>}
        {selected.map(f => <FutureCard key={f.id} f={f} oddsFormat={oddsFormat} decimals={decimals} />)}
      </div>
    </Panel>
  );
}

function OddsView({ season, teamsById, standings, settings, onOpenTeam, h2hMatrix, onStartPlayoffs, onClearPlayoffs, onStartPlayIn, onClearPlayIn }) {
  const [sim, setSim] = useState(null);
  const [running, setRunning] = useState(false);
  const [playoffSim, setPlayoffSim] = useState(null);
  const [runningPlayoff, setRunningPlayoff] = useState(false);
  const [preview, setPreview] = useState(null);
  const decimals = settings.oddsDecimals ?? 1;
  const oddsFormat = settings.oddsFormat || 'percent';
  const remaining = (season.games || []).filter(g => !g.played && !g.isPlayoff && !g.isPlayIn && g.homeTeamId && g.awayTeamId);
  const remainingByTeam = computeRemaining(season);
  const clinchElim = computeClinchElim(standings, settings.playoffSpots, remainingByTeam);
  const playoffGames = (season.games || []).filter(g => g.isPlayoff);
  const playInGames = (season.games || []).filter(g => g.isPlayIn);
  const playInWinnerId = getPlayInWinner(playInGames);
  const seededStandings = buildMainBracketSeeds(standings, settings, playInWinnerId);

  const runSim = () => { setRunning(true); setTimeout(() => { setSim(runSimulation(season, teamsById, settings.simRuns, settings.playoffSpots, h2hMatrix)); setRunning(false); }, 30); };
  const runPlayoffSim = () => {
    setRunningPlayoff(true);
    setTimeout(() => {
      setPlayoffSim(simulatePlayoffs(seededStandings, settings.playoffSpots, settings, h2hMatrix, settings.simRuns, settings.homeFieldBoost || 0, playoffGames));
      setRunningPlayoff(false);
    }, 30);
  };
  useEffect(() => { setSim(null); setPlayoffSim(null); setPreview(null); }, [season.id]);
  const maxSeed = standings.length;

  return (
    <div className="p-4 space-y-4">
      <PlayInBracket standings={standings} settings={settings} playInGames={playInGames} teamsById={teamsById} onStart={onStartPlayIn} onClear={onClearPlayIn} onOpenTeam={onOpenTeam} />
      <BracketView standings={seededStandings} settings={settings} playoffGames={playoffGames} teamsById={teamsById} onStart={onStartPlayoffs} onClear={onClearPlayoffs} onOpenTeam={onOpenTeam} h2hMatrix={h2hMatrix} />
      <FuturesPanel season={season} standings={standings} teamsById={teamsById} settings={settings} h2hMatrix={h2hMatrix} />

      <Panel>
        <SectionTitle right={<button onClick={runPlayoffSim} disabled={runningPlayoff || standings.length < 2} className="text-[11px] font-bold flex items-center gap-1 disabled:opacity-40" style={{ color: PRIMARY }}><RefreshCw size={13} className={runningPlayoff ? 'animate-spin' : ''} /> {runningPlayoff ? 'Simulating…' : 'Run playoff simulation'}</button>}>
          Playoff series odds
        </SectionTitle>
        {!playoffSim ? (
          <p className="px-4 pb-4 text-sm" style={{ color: CHALK_DIM }}>
            Simulates the full bracket many times — each round played out game-by-game as {(() => {
              const rc = Math.max(1, Math.log2(nextPow2(Math.min(settings.playoffSpots, standings.length) || 1)));
              const parts = [];
              for (let r = 1; r <= rc; r++) parts.push(`${r === rc ? 'the final' : `round ${r}`} Bo${getSeriesLength(settings, r)}`);
              return parts.join(', ');
            })()}, using regular-season and head-to-head strength plus a home-field edge of {settings.homeFieldBoost || 0} points per game{playoffGames.length > 0 ? ', resuming from the real series in progress.' : '.'}
          </p>
        ) : (
          <div className="overflow-x-auto px-2 pb-4">
            <table className="text-sm" style={{ color: CHALK, minWidth: '100%' }}>
              <thead><tr className="text-[10px] uppercase" style={{ color: CHALK_DIM }}>
                <th className="text-left px-2 py-1">Team</th>
                {Array.from({ length: playoffSim.roundsCount - 1 }).map((_, i) => <th key={i} className="px-2 py-1">Rd {i + 2} <span style={{ textTransform: 'none' }}>(Bo{getSeriesLength(settings, i + 2)})</span></th>)}
                <th className="px-2 py-1">Champion <span style={{ textTransform: 'none' }}>(Bo{getSeriesLength(settings, playoffSim.roundsCount)})</span></th>
              </tr></thead>
              <tbody>
                {standings.slice(0, Math.min(settings.playoffSpots, standings.length)).map(t => {
                  const r = playoffSim.results[t.id];
                  if (!r) return null;
                  return (
                    <tr key={t.id} style={{ borderTop: `1px solid ${LINE}` }}>
                      <td className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ borderLeft: `3px solid ${teamColor(t)}` }}><button onClick={() => onOpenTeam(t.id)} className="flex items-center gap-2 pl-1.5" style={{ color: CHALK }}><TeamMark team={t} size={16} /> {t.displayName}</button></td>
                      {Array.from({ length: playoffSim.roundsCount - 1 }).map((_, i) => {
                        const p = r.reachPct[i + 2] || 0;
                        return <td key={i} className="px-2 py-1.5 text-center font-mono text-xs" style={{ color: p >= 50 ? WIN : p > 0 ? CHALK : CHALK_DIM }}>{fmtOdds(p, oddsFormat, decimals)}</td>;
                      })}
                      <td className="px-2 py-1.5 text-center font-mono text-xs font-bold" style={{ color: r.championPct >= 25 ? GOLD : CHALK }}>{fmtOdds(r.championPct, oddsFormat, decimals)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {playoffSim && <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>"Rd N" is the chance of reaching that round; Champion is the chance of winning it all. Based on {settings.simRuns.toLocaleString()} simulated brackets.</p>}
      </Panel>

      <Panel>
        <SectionTitle>Magic &amp; elimination numbers</SectionTitle>
        <div className="overflow-x-auto px-2 pb-4">
          <table className="text-sm" style={{ color: CHALK }}>
            <thead><tr className="text-[10px] uppercase" style={{ color: CHALK_DIM }}><th className="text-left px-2 py-1">Team</th><th className="px-2 py-1">Status</th><th className="px-2 py-1">Number</th></tr></thead>
            <tbody>
              {standings.map(t => {
                const ce = clinchElim[t.id] || { status: 'alive', number: null };
                return (
                  <tr key={t.id} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ borderLeft: `3px solid ${teamColor(t)}` }}><button onClick={() => onOpenTeam(t.id)} className="flex items-center gap-2 pl-1.5" style={{ color: CHALK }}><TeamMark team={t} size={16} /> {t.displayName}</button></td>
                    <td className="px-2 py-1.5 text-center text-xs font-bold" style={{ color: ce.status === 'clinched' ? WIN : ce.status === 'eliminated' ? NEGATIVE : CHALK_DIM }}>
                      {ce.status === 'clinched' ? 'Clinched' : ce.status === 'eliminated' ? 'Eliminated' : 'Alive'}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono">{ce.number != null ? ce.number : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Approximate, based on remaining games count vs. the bubble teams — not a full combinatorial check.</p>
      </Panel>

      <Panel className="overflow-hidden" style={{ borderColor: PRIMARY }}>
        <SectionTitle accent={PRIMARY} right={<button onClick={() => setPreview(simulateRestOfSeasonOnce(season, teamsById, h2hMatrix))} disabled={remaining.length === 0} className="text-[11px] font-bold flex items-center gap-1 disabled:opacity-40" style={{ color: PRIMARY }}><Sparkles size={13} /> {preview ? 'Reroll' : 'Preview'}</button>}>
          Simulate rest of season
        </SectionTitle>
        {!preview ? (
          <p className="px-4 pb-4 text-sm" style={{ color: CHALK_DIM }}>Instantly fills in one random result for every remaining game and shows where the standings could land — a quick "what if" look, not a saved result or the full odds model above.</p>
        ) : (
          <div className="px-2 pb-4">
            {preview.map(t => (
              <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 text-sm" style={{ borderTop: `1px solid ${LINE}` }}>
                <span className="font-mono w-5 flex-shrink-0" style={{ color: t.rank <= settings.playoffSpots ? WIN : CHALK_DIM }}>{t.rank}</span>
                <button onClick={() => onOpenTeam(t.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left" style={{ color: CHALK }}><TeamMark team={t} size={15} /> <span className="truncate">{t.displayName}</span></button>
                <span className="font-mono text-xs" style={{ color: CHALK_DIM }}>{t.w}-{t.l}</span>
              </div>
            ))}
            <p className="px-2 pt-2 text-[11px]" style={{ color: CHALK_DIM }}>Green rank = a hypothetical playoff spot in this one random roll. Tap "Reroll" for a different outcome.</p>
          </div>
        )}
      </Panel>

      <Panel>
        <SectionTitle right={<button onClick={runSim} disabled={running || standings.length < 2} className="text-[11px] font-bold flex items-center gap-1 disabled:opacity-40" style={{ color: PRIMARY }}><RefreshCw size={13} className={running ? 'animate-spin' : ''} /> {running ? 'Simulating…' : 'Run simulation'}</button>}>
          Playoff odds ({settings.playoffSpots} spot{settings.playoffSpots === 1 ? '' : 's'}, {settings.simRuns.toLocaleString()} runs)
        </SectionTitle>
        {!sim ? <p className="px-4 pb-4 text-sm" style={{ color: CHALK_DIM }}>Run the simulation to project the {remaining.length} remaining games repeatedly, factoring in overall record, run differential, recent form, roster strength, and head-to-head history.</p> : (
          <div className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={Math.max(160, standings.length * 34)}>
              <BarChart data={standings.map(t => ({ name: t.displayName, pct: sim[t.id] ? Number(sim[t.id].playoffPct.toFixed(decimals)) : 0, id: t.id }))} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid stroke={LINE} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: CHALK_DIM, fontSize: 11 }} unit="%" />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: CHALK, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: PANEL2, border: `1px solid ${LINE}`, color: CHALK }} formatter={v => `${v}%`} />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]}>{standings.map(t => <Cell key={t.id} fill={teamColor(t)} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      {sim && (
        <Panel>
          <SectionTitle>Odds by finish position</SectionTitle>
          <div className="overflow-x-auto px-2 pb-4">
            <table className="text-sm" style={{ color: CHALK, minWidth: '100%' }}>
              <thead><tr className="text-[10px] uppercase" style={{ color: CHALK_DIM }}><th className="text-left px-2 py-1">Team</th>{Array.from({ length: maxSeed }).map((_, i) => <th key={i} className="px-2 py-1">{i + 1}</th>)}</tr></thead>
              <tbody>
                {standings.map(t => (
                  <tr key={t.id} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ borderLeft: `3px solid ${teamColor(t)}` }}><button onClick={() => onOpenTeam(t.id)} className="pl-1.5" style={{ color: CHALK }}>{t.displayName}</button></td>
                    {sim[t.id].seedPct.map((p, i) => <td key={i} className="px-2 py-1.5 text-center font-mono text-xs" style={{ color: p >= 50 ? WIN : p > 0 ? CHALK : CHALK_DIM }}>{p > 0 ? fmtOdds(p, oddsFormat, decimals) : '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 pb-4 text-xs" style={{ color: CHALK_DIM }}>Percent chance of finishing in each position, based on {settings.simRuns.toLocaleString()} simulated seasons.</p>
        </Panel>
      )}

      <Panel>
        <SectionTitle>Upcoming game odds</SectionTitle>
        <div className="px-3 pb-4 space-y-4 max-h-[420px] overflow-y-auto">
          {remaining.length === 0 && <p className="px-1 py-4 text-sm" style={{ color: CHALK_DIM }}>No unplayed games on the schedule.</p>}
          {(() => {
            const groups = [];
            const seen = {};
            remaining.forEach(g => {
              const gkey = roundGroupKey(g.date, settings.scheduleMode);
              if (!(gkey in seen)) { seen[gkey] = { key: gkey, label: g.date || 'Unlabeled', games: [] }; groups.push(seen[gkey]); }
              seen[gkey].games.push(g);
            });
            return groups.map(group => (
              <div key={group.key}>
                <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: PRIMARY }}>{settings.scheduleMode === 'round' ? formatRoundLabel(group.label) : group.label}</div>
                <div className="space-y-2">
                  {group.games.map(g => {
                    const home = standings.find(t => t.id === g.homeTeamId), away = standings.find(t => t.id === g.awayTeamId);
                    if (!home || !away) return null;
                    const h2h = h2hRecord(h2hMatrix, home.id, away.id);
                    const pHome = winProb(home, away, h2h);
                    const pctHome = pHome * 100, pctAway = 100 - pctHome;
                    const h2hGames = h2h.aWins + h2h.aLosses;
                    return (
                      <div key={g.id} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}`, background: PANEL2 }}>
                        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
                          <button onClick={() => onOpenTeam(away.id)} className="flex items-center gap-1.5 min-w-0 flex-1">
                            <TeamMark team={away} size={18} /> <span className="text-sm font-bold truncate" style={{ color: CHALK }}>{away.displayName}</span>
                          </button>
                          <span className="text-[10px] flex-shrink-0" style={{ color: CHALK_DIM }}>@</span>
                          <button onClick={() => onOpenTeam(home.id)} className="flex items-center gap-1.5 min-w-0 flex-1 flex-row-reverse text-right">
                            <TeamMark team={home} size={18} /> <span className="text-sm font-bold truncate" style={{ color: CHALK }}>{home.displayName}</span>
                          </button>
                        </div>
                        <div className="flex h-2 mx-3 rounded overflow-hidden" style={{ background: LINE }}>
                          <div style={{ width: `${pctAway}%`, background: teamColor(away) }} />
                          <div style={{ width: `${pctHome}%`, background: teamColor(home) }} />
                        </div>
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="font-mono text-sm font-bold" style={{ color: pctAway >= 50 ? WIN : CHALK_DIM }}>{fmtOdds(pctAway, oddsFormat, decimals)}</span>
                          {h2hGames > 0 && <span className="text-[10px] font-mono" style={{ color: CHALK_DIM }}>H2H {h2h.aWins}-{h2h.aLosses}</span>}
                          <span className="font-mono text-sm font-bold" style={{ color: pctHome >= 50 ? WIN : CHALK_DIM }}>{fmtOdds(pctHome, oddsFormat, decimals)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      </Panel>
    </div>
  );
}

/* ==================================================================== */
/* Extras view                                                           */
/* ==================================================================== */
/* ==================================================================== */
/* Awards                                                                */
/* ==================================================================== */
function AwardsView({ league, season, standings, teamsById, addAwardDef, updateAwardDef, removeAwardDef, setAwardWinner, clearAwardWinner }) {
  const { isLoggedIn } = useAuth();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [pickerId, setPickerId] = useState(null);
  const awardDefs = league.awardDefs || [];
  const winners = season.awardWinners || {};

  const allPlayers = [];
  season.members.forEach(m => {
    if (m.active === false) return;
    const gt = teamsById[m.teamId];
    (m.roster || []).forEach(p => allPlayers.push({ id: p.id, name: p.name, teamId: m.teamId, teamName: gt ? gt.name : m.scheduleName }));
  });

  return (
    <div className="p-4 space-y-4">
      <Panel>
        <SectionTitle>Create an award</SectionTitle>
        <fieldset disabled={!isLoggedIn} className="contents">
        <div className="px-4 pb-4 space-y-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Award name (e.g. MVP)" className="w-full bg-[#222D42] border rounded px-3 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }} />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)" className="w-full bg-[#222D42] border rounded px-3 py-2 text-sm" style={{ borderColor: LINE, color: CHALK }} />
          <button onClick={() => { if (name.trim()) { addAwardDef(name.trim(), desc.trim()); setName(''); setDesc(''); } }} className="px-3 py-2 rounded font-bold text-sm flex items-center gap-1" style={{ background: PRIMARY, color: INK }}><Plus size={16} /> Create award</button>
          <p className="text-xs" style={{ color: CHALK_DIM }}>Awards are shared across every season of this league — pick a winner for each one below, per season.</p>
        </div>
        </fieldset>
      </Panel>

      {awardDefs.length === 0 && <Panel><p className="px-4 py-8 text-sm text-center" style={{ color: CHALK_DIM }}>No awards yet — create one above.</p></Panel>}

      {awardDefs.map(a => {
        const w = winners[a.id];
        let winnerLabel = null;
        if (w) {
          if (w.type === 'team') { const t = teamsById[w.teamId]; winnerLabel = t ? t.name : 'Unknown team'; }
          else if (w.type === 'player') { const p = allPlayers.find(pl => pl.id === w.playerId); winnerLabel = p ? `${p.name} (${p.teamName})` : 'Unknown player'; }
        }
        return (
          <Panel key={a.id}>
            <SectionTitle right={isLoggedIn && <button onClick={() => removeAwardDef(a.id)} className="p-1 rounded" style={{ color: NEGATIVE }}><Trash2 size={14} /></button>}>{a.name}</SectionTitle>
            <div className="px-4 pb-4 space-y-2">
              {a.description && <p className="text-xs" style={{ color: CHALK_DIM }}>{a.description}</p>}
              {winnerLabel ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(245,198,75,0.12)' }}>
                  <span className="flex items-center gap-2 text-sm font-bold" style={{ color: GOLD }}><Crown size={15} /> {winnerLabel}</span>
                  {isLoggedIn && <button onClick={() => clearAwardWinner(a.id)} className="text-xs" style={{ color: CHALK_DIM }}>Clear</button>}
                </div>
              ) : isLoggedIn ? (
                <button onClick={() => setPickerId(pickerId === a.id ? null : a.id)} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ background: PANEL2, color: PRIMARY, border: `1px solid ${LINE}` }}>Pick a winner</button>
              ) : (
                <span className="text-xs" style={{ color: CHALK_DIM }}>No winner yet</span>
              )}
              {pickerId === a.id && (
                <div className="space-y-2 pt-2" style={{ borderTop: `1px solid ${LINE}` }}>
                  <div className="text-[10px] uppercase" style={{ color: CHALK_DIM }}>Teams</div>
                  <div className="flex flex-wrap gap-2">
                    {standings.map(t => <button key={t.id} onClick={() => { setAwardWinner(a.id, { type: 'team', teamId: t.id }); setPickerId(null); }} className="text-xs px-2 py-1 rounded" style={{ background: PANEL2, color: CHALK, border: `1px solid ${LINE}` }}>{t.displayName}</button>)}
                  </div>
                  {allPlayers.length > 0 && (
                    <>
                      <div className="text-[10px] uppercase pt-1" style={{ color: CHALK_DIM }}>Players</div>
                      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                        {allPlayers.map(p => <button key={p.id} onClick={() => { setAwardWinner(a.id, { type: 'player', playerId: p.id, teamId: p.teamId }); setPickerId(null); }} className="text-xs px-2 py-1 rounded" style={{ background: PANEL2, color: CHALK, border: `1px solid ${LINE}` }}>{p.name} <span style={{ color: CHALK_DIM }}>({p.teamName})</span></button>)}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}


function ExtrasView({ extras, teamsById, leagueRecords, activityLog, season, standings }) {
  if (!extras) return <div className="p-4 space-y-4"><Panel><p className="px-4 py-8 text-sm text-center" style={{ color: CHALK_DIM }}>Enter some scores to unlock fun stats here.</p></Panel></div>;
  const GameCard = ({ label, g, note }) => {
    if (!g) return null;
    const away = teamsById[g.awayTeamId], home = teamsById[g.homeTeamId];
    return (
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${LINE}`, borderLeft: `3px solid ${away ? teamColor(away) : LINE}`, borderRight: `3px solid ${home ? teamColor(home) : LINE}` }}>
        <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: PRIMARY }}>{label}</div>
        <div className="text-sm flex items-center gap-1.5" style={{ color: CHALK }}>{away && <TeamMark team={away} size={13} />}{g.awayName} <span className="font-mono">{g.awayScore}</span> @ {g.homeName} <span className="font-mono">{g.homeScore}</span>{home && <TeamMark team={home} size={13} />}</div>
        <div className="text-xs mt-0.5" style={{ color: CHALK_DIM }}>{g.date ? `${g.date} · ` : ''}{note}</div>
      </div>
    );
  };
  let movers = [];
  if (season) {
    const rounds = getOrderedRounds(season);
    if (rounds.length >= 2) {
      const firstRanked = computeStandingsThroughRound(season, teamsById, rounds, 0).active;
      const currentRanked = computeStandings(season, teamsById).active;
      const firstRankById = {};
      firstRanked.forEach(t => { firstRankById[t.id] = t.rank; });
      movers = currentRanked.filter(t => firstRankById[t.id] != null).map(t => ({ id: t.id, name: t.displayName, delta: firstRankById[t.id] - t.rank, from: firstRankById[t.id], to: t.rank }))
        .filter(m => m.delta !== 0).sort((a, b) => b.delta - a.delta);
    }
  }
  const biggestRiser = movers.length ? movers[0] : null;
  const biggestFaller = movers.length ? movers[movers.length - 1] : null;
  const turningPoint = season ? computeTurningPoint(season, teamsById) : null;
  const hasNotable = extras.highest || extras.lowest || extras.longest || extras.shortest || extras.biggestBlowout || extras.highestSingleTeamScore;
  const [recapCopied, setRecapCopied] = useState(false);
  const copyRecap = () => {
    const text = buildSeasonRecapText(season, standings || [], extras, teamsById);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => { setRecapCopied(true); setTimeout(() => setRecapCopied(false), 2000); }).catch(() => { prompt('Copy this text:', text); });
    } else { prompt('Copy this text:', text); }
  };
  return (
    <div className="p-4 space-y-4">
      {season && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD} right={<button onClick={copyRecap} className="text-[11px] font-bold flex items-center gap-1" style={{ color: recapCopied ? WIN : PRIMARY }}><Save size={12} /> {recapCopied ? 'Copied!' : 'Copy'}</button>}>Season recap</SectionTitle>
          <p className="px-4 pb-4 text-xs" style={{ color: CHALK_DIM }}>A shareable text summary — champion, leader, and standout games — ready to paste anywhere.</p>
        </Panel>
      )}
      {(biggestRiser && biggestRiser.delta > 0) || (biggestFaller && biggestFaller.delta < 0) ? (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Biggest movers</SectionTitle>
          <div className="px-2 pb-2">
            {biggestRiser && biggestRiser.delta > 0 && (
              <div className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderTop: `1px solid ${LINE}` }}>
                <span style={{ color: WIN }}>▲</span>
                <span className="flex-1" style={{ color: CHALK }}>{biggestRiser.name}</span>
                <span className="font-mono text-xs" style={{ color: CHALK_DIM }}>#{biggestRiser.from} → #{biggestRiser.to}</span>
              </div>
            )}
            {biggestFaller && biggestFaller.delta < 0 && biggestFaller.id !== biggestRiser?.id && (
              <div className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderTop: `1px solid ${LINE}` }}>
                <span style={{ color: NEGATIVE }}>▼</span>
                <span className="flex-1" style={{ color: CHALK }}>{biggestFaller.name}</span>
                <span className="font-mono text-xs" style={{ color: CHALK_DIM }}>#{biggestFaller.from} → #{biggestFaller.to}</span>
              </div>
            )}
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Standings position from the first round of the season to now.</p>
        </Panel>
      ) : null}
      {turningPoint && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Turning point of the season</SectionTitle>
          <div className="px-4 pb-4">
            <div className="text-sm flex items-center gap-1.5" style={{ color: CHALK }}>
              {teamsById[turningPoint.game.awayTeamId] && <TeamMark team={teamsById[turningPoint.game.awayTeamId]} size={13} />}
              {(teamsById[turningPoint.game.awayTeamId] || {}).name || turningPoint.game.awayScheduleName} <span className="font-mono">{turningPoint.game.awayScore}</span> @ {(teamsById[turningPoint.game.homeTeamId] || {}).name || turningPoint.game.homeScheduleName} <span className="font-mono">{turningPoint.game.homeScore}</span>
              {teamsById[turningPoint.game.homeTeamId] && <TeamMark team={teamsById[turningPoint.game.homeTeamId]} size={13} />}
            </div>
            <p className="text-xs mt-1" style={{ color: CHALK_DIM }}>{turningPoint.game.date ? `${turningPoint.game.date} · ` : ''}{turningPoint.winnerName} cut {turningPoint.beforeGb.toFixed(1)} games back to {turningPoint.afterGb.toFixed(1)} — the single biggest standings swing of the season.</p>
          </div>
        </Panel>
      )}
      {hasNotable && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Notable games</SectionTitle>
          <div>
            {extras.highest && <GameCard label="Highest scoring" g={extras.highest} note={`${extras.highest.total} combined runs`} />}
            {extras.lowest && <GameCard label="Lowest scoring" g={extras.lowest} note={`${extras.lowest.total} combined runs`} />}
            {extras.longest && <GameCard label="Longest game" g={extras.longest} note={`${extras.longest.innings || '—'} innings`} />}
            {extras.shortest && <GameCard label="Shortest game" g={extras.shortest} note={`${extras.shortest.innings || '—'} innings`} />}
            {extras.biggestBlowout && <GameCard label="Biggest blowout" g={extras.biggestBlowout} note={`won by ${extras.biggestBlowout.margin}`} />}
            {extras.highestSingleTeamScore && <GameCard label="Best single-team output" g={extras.highestSingleTeamScore} note={`${extras.highestSingleTeamScore.topTeamName} put up ${extras.highestSingleTeamScore.topScore}`} />}
          </div>
        </Panel>
      )}
      <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
        <SectionTitle accent={GOLD}>League totals</SectionTitle>
        <div className="grid grid-cols-3 gap-px" style={{ background: LINE }}>
          <StatBox label="Games Played" value={extras.totalGames} />
          <StatBox label="1-Run Games" value={extras.oneRunCount} />
          <StatBox label="Extra-Inning Games" value={extras.xInnCount} />
          <StatBox label="Forfeits" value={extras.forfeitCount} />
        </div>
      </Panel>
      {extras.sweeps.length > 0 && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Season sweeps</SectionTitle>
          <div className="px-2 pb-2">
            {extras.sweeps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}` }}>
                <span className="flex-1" style={{ color: CHALK }}><span className="font-bold" style={{ color: WIN }}>{s.winnerName}</span> swept the season series {s.count}-0 vs {s.loserName}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {extras.upsets && extras.upsets.length > 0 && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Upset alerts</SectionTitle>
          <div className="px-2 pb-2">
            {extras.upsets.map((u, i) => (
              <div key={i} className="px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}` }}>
                <span style={{ color: CHALK }}><span className="font-bold" style={{ color: GOLD }}>#{u.winnerRank} {u.winnerName}</span> beat <span style={{ color: CHALK_DIM }}>#{u.loserRank} {u.loserName}</span></span>
                <div className="text-[11px]" style={{ color: CHALK_DIM }}>{u.date ? `${u.date} · ` : ''}{u.awayScore}-{u.homeScore}</div>
              </div>
            ))}
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Based on final standings rank, not the rank at the time the game was actually played.</p>
        </Panel>
      )}
      {extras.rivalries && extras.rivalries.length > 0 && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Rivalry index</SectionTitle>
          <div className="px-2 pb-2">
            {extras.rivalries.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}` }}>
                <span style={{ color: CHALK }}>{r.nameA} vs {r.nameB}</span>
                <span className="font-mono text-xs" style={{ color: CHALK_DIM }}>{r.winsA}-{r.winsB} ({r.count} games)</span>
              </div>
            ))}
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Ranked by how even the head-to-head series is — the closer to a 50/50 split (with more meetings breaking ties), the bigger the rivalry.</p>
        </Panel>
      )}
      {extras.closest.length > 0 && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Nail-biters (1-run or tied)</SectionTitle>
          <div className="px-2 pb-2">
            {extras.closest.map((g, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-2 text-sm" style={{ borderBottom: `1px solid ${LINE}` }}>
                <span className="text-[11px] w-14 flex-shrink-0" style={{ color: CHALK_DIM }}>{g.date || '—'}</span>
                <span className="flex-1 truncate" style={{ color: CHALK }}>{g.awayName} {g.awayScore} @ {g.homeName} {g.homeScore}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {leagueRecords && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>League records book</SectionTitle>
          <div className="px-2 pb-2">
            {leagueRecords.bestRecord && (
              <div className="px-2 py-2 text-sm" style={{ borderTop: `1px solid ${LINE}` }}>
                <div className="text-[10px] uppercase" style={{ color: PRIMARY }}>Best single-season record</div>
                <div style={{ color: CHALK }}>{leagueRecords.bestRecord.teamName} — {leagueRecords.bestRecord.w}-{leagueRecords.bestRecord.l} <span style={{ color: CHALK_DIM }}>({leagueRecords.bestRecord.seasonName})</span></div>
              </div>
            )}
            {leagueRecords.bestRunDiff && (
              <div className="px-2 py-2 text-sm" style={{ borderTop: `1px solid ${LINE}` }}>
                <div className="text-[10px] uppercase" style={{ color: PRIMARY }}>Best run differential (season)</div>
                <div style={{ color: CHALK }}>{leagueRecords.bestRunDiff.teamName} — {leagueRecords.bestRunDiff.diff > 0 ? `+${leagueRecords.bestRunDiff.diff}` : leagueRecords.bestRunDiff.diff} <span style={{ color: CHALK_DIM }}>({leagueRecords.bestRunDiff.seasonName})</span></div>
              </div>
            )}
            {leagueRecords.longestStreak && leagueRecords.longestStreak.count > 0 && (
              <div className="px-2 py-2 text-sm" style={{ borderTop: `1px solid ${LINE}` }}>
                <div className="text-[10px] uppercase" style={{ color: PRIMARY }}>Longest win streak</div>
                <div style={{ color: CHALK }}>{leagueRecords.longestStreak.teamName} — {leagueRecords.longestStreak.count} games <span style={{ color: CHALK_DIM }}>({leagueRecords.longestStreak.seasonName})</span></div>
              </div>
            )}
            {leagueRecords.highestScore && (
              <div className="px-2 py-2 text-sm" style={{ borderTop: `1px solid ${LINE}` }}>
                <div className="text-[10px] uppercase" style={{ color: PRIMARY }}>Highest single-team score</div>
                <div style={{ color: CHALK }}>{leagueRecords.highestScore.teamName} — {leagueRecords.highestScore.score} <span style={{ color: CHALK_DIM }}>({leagueRecords.highestScore.seasonName})</span></div>
              </div>
            )}
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Scanned across every season in this league.</p>
        </Panel>
      )}
      {activityLog && activityLog.length > 0 && (
        <Panel className="overflow-hidden" style={{ borderColor: GOLD }}>
          <SectionTitle accent={GOLD}>Recent activity</SectionTitle>
          <div className="px-2 pb-2 max-h-64 overflow-y-auto">
            {activityLog.slice().reverse().slice(0, 20).map(a => (
              <div key={a.id} className="px-2 py-2 text-sm" style={{ borderTop: `1px solid ${LINE}`, color: CHALK }}>{a.text}</div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ==================================================================== */
/* Graphs view                                                           */
/* ==================================================================== */
function GraphsView({ league, roundHistory, standings, scoringTrend, season, h2hMatrix, onOpenTeam, sport }) {
  const [metric, setMetric] = useState('rank');
  const [selectedIdx, setSelectedIdx] = useState(null);
  if (roundHistory.length === 0) return <div className="p-4"><Panel><p className="px-4 py-8 text-sm text-center" style={{ color: CHALK_DIM }}>Enter some scores in the Schedule tab to see trend graphs.</p></Panel></div>;

  const chartData = roundHistory.map(snap => {
    const row = { label: snap.label };
    snap.standings.forEach(t => { row[t.id] = metric === 'rank' ? t.rank : metric === 'gb' ? t.gb : metric === 'diff' ? t.diff : metric === 'wins' ? t.w : t.pct; });
    return row;
  });
  const metricLabel = { rank: 'Standings position', gb: 'Games behind leader', diff: 'Run differential', pct: 'Win percentage', wins: 'Cumulative wins' }[metric];
  const yReversed = metric === 'rank';
  const fmtVal = (v) => v == null ? '—' : (metric === 'pct' ? v.toFixed(3).replace(/^0/, '') : (metric === 'rank' || metric === 'wins' ? v : (v > 0 ? `+${v}` : v)));

  // Margin-of-victory distribution across the whole season
  const scoreWord = sport ? sport.scorePlural : 'runs';
  const marginBuckets = { '1': 0, '2-3': 0, '4-6': 0, '7+': 0 };
  (season.games || []).filter(g => g.played && !g.isPlayoff && !g.isForfeit).forEach(g => {
    const m = Math.abs(Number(g.homeScore) - Number(g.awayScore));
    if (m <= 1) marginBuckets['1']++;
    else if (m <= 3) marginBuckets['2-3']++;
    else if (m <= 6) marginBuckets['4-6']++;
    else marginBuckets['7+']++;
  });
  const marginLabels = { '1': `1 ${sport ? sport.score : 'run'}`, '2-3': `2-3 ${scoreWord}`, '4-6': `4-6 ${scoreWord}`, '7+': `7+ ${scoreWord}` };
  const marginData = Object.entries(marginBuckets).map(([bucket, count]) => ({ bucket: marginLabels[bucket], count }));

  // Offense vs. defense scatter (RS/G on x, RA/G on y — inverted so "up and to the right" reads as good)
  const scatterData = standings.map(t => ({ x: t.rsPerG, y: t.raPerG, name: t.displayName, id: t.id, color: teamColor(t) }));
  const leagueAvgRs = standings.length ? standings.reduce((s, t) => s + t.rsPerG, 0) / standings.length : 0;
  const leagueAvgRa = standings.length ? standings.reduce((s, t) => s + t.raPerG, 0) / standings.length : 0;

  // Power ranking trend — same composite formula as the Stats tab (win% +
  // run-diff/game + strength-of-schedule adjustment), tracked at every round
  // snapshot instead of just the current moment.
  const powerTrendData = roundHistory.map(snap => {
    const row = { label: snap.label };
    snap.standings.forEach(t => {
      const diffPerG = t.gp > 0 ? t.diff / t.gp : 0;
      const sosAdj = ((t.sos != null ? t.sos : 0.5) - 0.5) * 0.2;
      row[t.id] = t.pct + diffPerG * 0.1 + sosAdj;
    });
    return row;
  });

  // Strength of schedule vs. win% — teams above the diagonal-ish trend are
  // over-performing a tough schedule; below it, under-performing a soft one.
  const sosData = standings.filter(t => t.sos != null).map(t => ({ x: t.sos, y: t.pct, name: t.displayName, id: t.id, color: teamColor(t) }));

  // Home vs. away win% per team
  const homeAwayData = standings.map(t => ({
    name: t.displayName,
    home: (t.homeW + t.homeL) > 0 ? (t.homeW / (t.homeW + t.homeL)) * 100 : 0,
    away: (t.awayW + t.awayL) > 0 ? (t.awayW / (t.awayW + t.awayL)) * 100 : 0,
  }));

  return (
    <div className="p-4 space-y-4">
      <Panel>
        <SectionTitle right={
          <select value={metric} onChange={e => { setMetric(e.target.value); setSelectedIdx(null); }} className="bg-[#222D42] border rounded px-2 py-1 text-xs" style={{ borderColor: LINE, color: CHALK }}>
            <option style={{ background: PANEL2, color: CHALK }} value="rank">Position</option><option style={{ background: PANEL2, color: CHALK }} value="gb">Games behind</option><option style={{ background: PANEL2, color: CHALK }} value="diff">Run diff</option><option style={{ background: PANEL2, color: CHALK }} value="pct">Win %</option><option style={{ background: PANEL2, color: CHALK }} value="wins">Wins</option>
          </select>
        }>{metricLabel} by round</SectionTitle>
        <div className="px-2 pb-2">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ left: -10, right: 12, top: 8 }} onClick={e => { if (e && e.activeTooltipIndex != null) setSelectedIdx(e.activeTooltipIndex); }} onMouseMove={e => { if (e && e.activeTooltipIndex != null) setSelectedIdx(e.activeTooltipIndex); }}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: CHALK_DIM, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis reversed={yReversed} allowDecimals={metric !== 'rank' && metric !== 'wins'} tick={{ fill: CHALK_DIM, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: PANEL2, border: `1px solid ${LINE}`, color: CHALK }} />
              <Legend wrapperStyle={{ fontSize: 11, color: CHALK_DIM }} />
              {selectedIdx != null && chartData[selectedIdx] && <ReferenceLine x={chartData[selectedIdx].label} stroke={CHALK_DIM} strokeDasharray="4 4" />}
              {league.map(t => <Line key={t.id} type="monotone" dataKey={t.id} name={t.name} stroke={teamColor(t)} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />)}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px] px-2 pb-2" style={{ color: CHALK_DIM }}>Tap or click a point on the line to pin its exact values below.</p>
          {selectedIdx != null && chartData[selectedIdx] && (
            <div className="mx-2 mb-2 p-3 rounded-lg" style={{ background: PANEL2, border: `1px solid ${LINE}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold" style={{ color: PRIMARY }}>{chartData[selectedIdx].label}</span>
                <button onClick={() => setSelectedIdx(null)} className="text-[11px]" style={{ color: CHALK_DIM }}>Clear</button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {league.map(t => (
                  <button key={t.id} onClick={() => onOpenTeam(t.id)} className="flex items-center gap-1.5 text-xs font-mono">
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: teamColor(t), display: 'inline-block' }} />
                    <span style={{ color: CHALK }}>{t.name}:</span>
                    <span style={{ color: CHALK_DIM }}>{fmtVal(chartData[selectedIdx][t.id])}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Offense vs. defense</SectionTitle>
        <div className="px-2 pb-2">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: -10 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" name="Runs scored/game" tick={{ fill: CHALK_DIM, fontSize: 10 }} label={{ value: 'Runs scored / game →', position: 'insideBottom', offset: -4, fill: CHALK_DIM, fontSize: 10 }} />
              <YAxis type="number" dataKey="y" name="Runs allowed/game" reversed tick={{ fill: CHALK_DIM, fontSize: 10 }} label={{ value: '← Runs allowed / game (better)', angle: -90, position: 'insideLeft', fill: CHALK_DIM, fontSize: 10 }} />
              <ZAxis range={[80, 80]} />
              <ReferenceLine x={leagueAvgRs} stroke={LINE} />
              <ReferenceLine y={leagueAvgRa} stroke={LINE} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: PANEL2, border: `1px solid ${LINE}`, color: CHALK }} formatter={(v, n) => [v.toFixed(2), n === 'x' ? 'RS/G' : 'RA/G']} labelFormatter={() => ''} />
              <Scatter data={scatterData} onClick={(d) => onOpenTeam(d.id)}>
                {scatterData.map(d => <Cell key={d.id} fill={d.color} cursor="pointer" />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-[11px] px-2 pb-2" style={{ color: CHALK_DIM }}>Top-right quadrant (relative to the gray league-average lines) = above-average offense and defense. Tap a dot to open that team.</p>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Power ranking trend</SectionTitle>
        <div className="px-2 pb-2">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={powerTrendData} margin={{ left: -10, right: 12, top: 8 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: CHALK_DIM, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: CHALK_DIM, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: PANEL2, border: `1px solid ${LINE}`, color: CHALK }} />
              <Legend wrapperStyle={{ fontSize: 11, color: CHALK_DIM }} />
              {league.map(t => <Line key={t.id} type="monotone" dataKey={t.id} name={t.name} stroke={teamColor(t)} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />)}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px] px-2 pb-2" style={{ color: CHALK_DIM }}>The same composite score from the Power Rankings panel in Stats (win% + run differential + strength of schedule), tracked round by round instead of just right now.</p>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Strength of schedule vs. win %</SectionTitle>
        <div className="px-2 pb-2">
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: -10 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" domain={[0, 1]} tick={{ fill: CHALK_DIM, fontSize: 10 }} label={{ value: 'Strength of schedule →', position: 'insideBottom', offset: -4, fill: CHALK_DIM, fontSize: 10 }} />
              <YAxis type="number" dataKey="y" domain={[0, 1]} tick={{ fill: CHALK_DIM, fontSize: 10 }} label={{ value: 'Win % →', angle: -90, position: 'insideLeft', fill: CHALK_DIM, fontSize: 10 }} />
              <ZAxis range={[80, 80]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: PANEL2, border: `1px solid ${LINE}`, color: CHALK }} formatter={(v, n) => [v.toFixed(3), n === 'x' ? 'SOS' : 'Win%']} labelFormatter={() => ''} />
              <Scatter data={sosData} onClick={(d) => onOpenTeam(d.id)}>
                {sosData.map(d => <Cell key={d.id} fill={d.color} cursor="pointer" />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-[11px] px-2 pb-2" style={{ color: CHALK_DIM }}>Up and to the right = winning a lot against a tough schedule. Up and to the left = padding a good record against a soft one. Tap a dot to open that team.</p>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Home vs. away win %</SectionTitle>
        <div className="px-2 pb-4">
          <ResponsiveContainer width="100%" height={Math.max(160, standings.length * 30)}>
            <BarChart data={homeAwayData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke={LINE} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: CHALK_DIM, fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fill: CHALK, fontSize: 11 }} />
              <Tooltip contentStyle={{ background: PANEL2, border: `1px solid ${LINE}`, color: CHALK }} formatter={v => `${v.toFixed(0)}%`} />
              <Legend wrapperStyle={{ fontSize: 11, color: CHALK_DIM }} />
              <Bar dataKey="home" name="Home win %" fill={PRIMARY} radius={[0, 3, 3, 0]} />
              <Bar dataKey="away" name="Away win %" fill={GOLD} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Runs for vs. against</SectionTitle>
        <div className="px-2 pb-4">
          <ResponsiveContainer width="100%" height={Math.max(160, standings.length * 30)}>
            <BarChart data={standings.map(t => ({ name: t.displayName, RF: t.rf, RA: t.ra }))} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke={LINE} horizontal={false} />
              <XAxis type="number" tick={{ fill: CHALK_DIM, fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fill: CHALK, fontSize: 11 }} />
              <Tooltip contentStyle={{ background: PANEL2, border: `1px solid ${LINE}`, color: CHALK }} />
              <Legend wrapperStyle={{ fontSize: 11, color: CHALK_DIM }} />
              <Bar dataKey="RF" fill={WIN} radius={[0, 3, 3, 0]} />
              <Bar dataKey="RA" fill={NEGATIVE} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Margin of victory</SectionTitle>
        <div className="px-2 pb-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={marginData} margin={{ left: -10, right: 16, top: 8 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fill: CHALK_DIM, fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: CHALK_DIM, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: PANEL2, border: `1px solid ${LINE}`, color: CHALK }} />
              <Bar dataKey="count" name="Games" radius={[4, 4, 0, 0]}>
                {marginData.map((d, i) => <Cell key={i} fill={i === 0 ? WIN : PRIMARY} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] px-2" style={{ color: CHALK_DIM }}>How many games were decided by each run margin this season.</p>
        </div>
      </Panel>

      {scoringTrend.length > 0 && (
        <Panel>
          <SectionTitle>League scoring trend</SectionTitle>
          <div className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={scoringTrend} margin={{ left: -10, right: 12, top: 8 }}>
                <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: CHALK_DIM, fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: CHALK_DIM, fontSize: 10 }} />
                <Tooltip contentStyle={{ background: PANEL2, border: `1px solid ${LINE}`, color: CHALK }} />
                <Line type="monotone" dataKey="avgRuns" name="Avg. combined runs/game" stroke={GOLD} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {standings.length > 1 && (
        <Panel>
          <SectionTitle>Head-to-head win matrix</SectionTitle>
          <div className="overflow-x-auto px-2 pb-4">
            <table className="text-xs" style={{ color: CHALK }}>
              <thead>
                <tr>
                  <th className="px-1.5 py-1"></th>
                  {standings.map(t => <th key={t.id} className="px-1.5 py-1"><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: teamColor(t) }} /></th>)}
                </tr>
              </thead>
              <tbody>
                {standings.map(row => (
                  <tr key={row.id} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td className="px-1.5 py-1 font-semibold whitespace-nowrap"><button onClick={() => onOpenTeam(row.id)} className="flex items-center gap-1" style={{ color: CHALK }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: teamColor(row) }} /> {row.displayName}</button></td>
                    {standings.map(col => {
                      if (col.id === row.id) return <td key={col.id} className="px-1.5 py-1 text-center" style={{ color: LINE }}>—</td>;
                      const rec = h2hMatrix[row.id] && h2hMatrix[row.id][col.id];
                      if (!rec || rec.w + rec.l === 0) return <td key={col.id} className="px-1.5 py-1 text-center" style={{ color: CHALK_DIM }}>·</td>;
                      return <td key={col.id} className="px-1.5 py-1 text-center font-mono" style={{ color: rec.w > rec.l ? WIN : rec.w < rec.l ? NEGATIVE : CHALK_DIM }}>{rec.w}-{rec.l}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 pb-4 text-[11px]" style={{ color: CHALK_DIM }}>Reading across a row: that team's record against each column team.</p>
        </Panel>
      )}
    </div>
  );
}

/* ==================================================================== */
/* Main App                                                              */
/* ==================================================================== */
function App() {
  const { isLoggedIn } = useAuth();
  const [screen, setScreen] = useState(FIXED_LEAGUE_ID ? 'league' : 'leagues'); // leagues | registry | history | league
  const [leaguesIndex, setLeaguesIndex] = useState([]);
  const [teamsIndex, setTeamsIndex] = useState([]);
  const [teamsById, setTeamsById] = useState({});
  const [league, setLeague] = useState(null);
  const [tab, setTab] = useState('home');
  const [prevTab, setPrevTab] = useState('home');
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [compareInitialId, setCompareInitialId] = useState(null);
  const [historyBack, setHistoryBack] = useState('leagues');
  const [historyTeamId, setHistoryTeamId] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [roundIdx, setRoundIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [theme, setTheme] = useState(DEFAULT_THEME);

  useEffect(() => {
    (async () => {
      const raw = await loadObj('theme');
      if (raw) setTheme({ ...DEFAULT_THEME, ...raw });
    })();
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--lt-chalk', theme.chalk || DEFAULT_THEME.chalk);
    root.style.setProperty('--lt-chalk-dim', theme.chalkDim || DEFAULT_THEME.chalkDim);
    root.style.setProperty('--lt-primary', theme.primary || DEFAULT_THEME.primary);
    root.style.setProperty('--lt-ink', theme.ink || DEFAULT_THEME.ink);
    root.style.setProperty('--lt-panel', theme.panel || DEFAULT_THEME.panel);
    root.style.setProperty('--lt-panel2', theme.panel2 || DEFAULT_THEME.panel2);
    root.style.setProperty('--lt-line', theme.line || DEFAULT_THEME.line);
  }, [theme]);
  const saveTheme = (next) => { setTheme(next); saveObj('theme', next); };

  const leagueRef = useRef(null);
  const saveQueuesRef = useRef({});
  useEffect(() => { leagueRef.current = league; }, [league]);

  const queueSave = useCallback((key, obj) => {
    setSaveStatus('saving');
    const prevQ = saveQueuesRef.current[key] || Promise.resolve();
    const q = prevQ.then(() => saveObj(key, obj)).then(ok => { setSaveStatus(ok ? 'saved' : 'error'); return ok; }).catch(() => { setSaveStatus('error'); });
    saveQueuesRef.current[key] = q;
    return q;
  }, []);
  const flushAllQueues = useCallback(async () => { await Promise.all(Object.values(saveQueuesRef.current)); }, []);

  useEffect(() => {
    const flush = () => {
      const lg = leagueRef.current;
      if (!lg) return;
      try { storSet(`league:${lg.id}`, JSON.stringify(lg)); } catch (e) { /* best effort */ }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', flush); };
  }, []);

  const refreshTeamsById = useCallback(async (ids) => {
    const uniq = [...new Set(ids)];
    const missing = uniq.filter(id => !teamsById[id]);
    if (missing.length === 0) return;
    const loaded = {};
    for (const id of missing) { const t = await loadObj(`team:${id}`); if (t) loaded[id] = t; }
    setTeamsById(prev => ({ ...prev, ...loaded }));
  }, [teamsById]);

  useEffect(() => {
    (async () => {
      if (FIXED_LEAGUE_ID) {
        await openLeague(FIXED_LEAGUE_ID);
        setLoading(false);
        return;
      }
      const [lIdx, tIdx] = await Promise.all([loadList('leagues-index'), loadList('teams-index')]);
      setLeaguesIndex(lIdx);
      setTeamsIndex(tIdx);
      const lastId = await storGet('current-league-id');
      if (lastId && lIdx.find(l => l.id === lastId)) {
        const raw = await loadObj(`league:${lastId}`);
        if (raw) {
          const shaped = migrateShape(raw);
          setLeague(shaped);
          const ids = [];
          shaped.seasons.forEach(s => s.members.forEach(m => ids.push(m.teamId)));
          const loadedT = {};
          for (const id of [...new Set(ids)]) { const t = await loadObj(`team:${id}`); if (t) loadedT[id] = t; }
          setTeamsById(loadedT);
          setTab('home');
        }
      }
      setLoading(false);
    })();
  }, []);

  const persistLeague = useCallback((lg) => { setLeague(lg); queueSave(`league:${lg.id}`, lg); }, [queueSave]);
  const retrySave = useCallback(() => { if (leagueRef.current) queueSave(`league:${leagueRef.current.id}`, leagueRef.current); }, [queueSave]);

  const refreshIndexes = async () => { setLeaguesIndex(await loadList('leagues-index')); setTeamsIndex(await loadList('teams-index')); };

  /* ---- leagues ---- */
  const openLeague = async (id) => {
    setLoadError(null);
    try {
      const raw = await loadObj(`league:${id}`);
      if (!raw) { setLoadError("Couldn't open that league — it may have been removed. Try refreshing the list."); await refreshIndexes(); return; }
      let shaped = migrateShape(raw);
      // persist any migration + create global teams for legacy embedded teams
      if (shaped._legacyTeams) {
        for (const t of shaped._legacyTeams) {
          const existing = await loadObj(`team:${t.id}`);
          if (!existing) {
            const gt = { id: t.id, name: t.displayName || t.scheduleName, color: t.color || null, logoUrl: t.logoUrl || null, wordmarkUrl: t.wordmarkUrl || null, createdAt: Date.now() };
            await saveObj(`team:${t.id}`, gt);
            const idx = await loadList('teams-index');
            if (!idx.find(x => x.id === t.id)) { idx.push({ id: t.id, name: gt.name }); await saveList('teams-index', idx); }
          }
        }
        delete shaped._legacyTeams;
        await saveObj(`league:${id}`, shaped);
        await refreshIndexes();
      }
      setLeague(shaped);
      const ids = [];
      shaped.seasons.forEach(s => s.members.forEach(m => ids.push(m.teamId)));
      const loadedT = {};
      for (const tid of [...new Set(ids)]) { const t = await loadObj(`team:${tid}`); if (t) loadedT[tid] = t; }
      setTeamsById(prev => ({ ...prev, ...loadedT }));
      setSelectedTeamId(null);
      setRoundIdx(0);
      setTab(shaped.seasons.length ? 'home' : 'seasons');
      setScreen('league');
      await storSet('current-league-id', id);
    } catch (e) { setLoadError('Something went wrong opening that league. Please try again.'); }
  };

  const createLeague = async (name, sport) => {
    const season = newSeason('Season 1');
    const lg = { id: uid('league'), name, sport: sport || 'baseball', createdAt: Date.now(), seasons: [season], activeSeasonId: season.id };
    await saveObj(`league:${lg.id}`, lg);
    const newIdx = [...leaguesIndex, { id: lg.id, name }];
    setLeaguesIndex(newIdx); await saveList('leagues-index', newIdx);
    setLeague(lg); setTab('home'); setScreen('league'); setSelectedTeamId(null); setRoundIdx(0);
    await storSet('current-league-id', lg.id);
  };
  const deleteLeagueById = async (id) => {
    await storDelete(`league:${id}`);
    const newIdx = leaguesIndex.filter(l => l.id !== id);
    setLeaguesIndex(newIdx); await saveList('leagues-index', newIdx);
    if (league && league.id === id) { setLeague(null); setScreen('leagues'); }
  };
  const renameLeague = async (id, name) => {
    const newIdx = leaguesIndex.map(l => l.id === id ? { ...l, name } : l);
    setLeaguesIndex(newIdx); await saveList('leagues-index', newIdx);
    if (league && league.id === id) persistLeague({ ...league, name });
    else { const lg = await loadObj(`league:${id}`); if (lg) await saveObj(`league:${id}`, { ...lg, name }); }
  };
  const setLeagueTagline = (tagline) => { if (league) persistLeague({ ...league, tagline }); };
  const backToLeagues = async () => {
    try { await flushAllQueues(); } catch (e) { /* best effort */ }
    setLeague(null); setSelectedTeamId(null); setScreen('leagues'); setLoadError(null);
    refreshIndexes();
  };

  /* ---- global team registry ---- */
  const openRegistry = async () => {
    const idx = await loadList('teams-index');
    setTeamsIndex(idx);
    setLeaguesIndex(await loadList('leagues-index'));
    const missing = idx.filter(t => !teamsById[t.id]);
    if (missing.length) {
      const loaded = {};
      for (const t of missing) { const gt = await loadObj(`team:${t.id}`); if (gt) loaded[t.id] = gt; }
      setTeamsById(prev => ({ ...prev, ...loaded }));
    }
    setScreen('registry');
  };
  const createGlobalTeam = async (name) => {
    const gt = { id: uid('t'), name, color: null, logoUrl: null, wordmarkUrl: null, createdAt: Date.now() };
    await saveObj(`team:${gt.id}`, gt);
    const idx = [...teamsIndex, { id: gt.id, name }];
    setTeamsIndex(idx); await saveList('teams-index', idx);
    setTeamsById(prev => ({ ...prev, [gt.id]: gt }));
    return gt;
  };
  const openTeamHistory = async (teamId, back) => {
    setHistoryBack(back || screen);
    setHistoryTeamId(teamId);
    setScreen('history');
    setHistoryLoading(true);
    let team = teamsById[teamId];
    if (!team) { team = await loadObj(`team:${teamId}`); if (team) setTeamsById(prev => ({ ...prev, [teamId]: team })); }
    const results = [];
    for (const l of leaguesIndex) {
      const raw = await loadObj(`league:${l.id}`);
      if (!raw) continue;
      const shaped = migrateShape(raw);
      const localTeamsById = { ...teamsById };
      (shaped._legacyTeams || []).forEach(t => { if (!localTeamsById[t.id]) localTeamsById[t.id] = { id: t.id, name: t.displayName || t.scheduleName, color: t.color, logoUrl: t.logoUrl, wordmarkUrl: t.wordmarkUrl }; });
      if (team) localTeamsById[teamId] = team;
      shaped.seasons.forEach(s => {
        const member = s.members.find(m => m.teamId === teamId);
        if (!member) return;
        const st = computeStandings(s, localTeamsById);
        const row = st.all.find(t => t.id === teamId);
        results.push({
          leagueName: shaped.name, seasonName: s.name,
          record: row ? `${row.w}-${row.l}` : '0-0',
          w: row ? row.w : 0, l: row ? row.l : 0,
          rank: st.active.find(t => t.id === teamId)?.rank || null,
          champion: s.championTeamId === teamId,
          managerName: ((member.roster || []).find(p => (p.role || '').trim().toUpperCase() === 'PM') || {}).name || member.managerName || null,
        });
      });
    }
    setHistoryData(results);
    setHistoryLoading(false);
  };

  /* ---- seasons ---- */
  const activeSeasonRaw = useMemo(() => league ? league.seasons.find(s => s.id === league.activeSeasonId) || league.seasons[0] : null, [league]);
  // Backfill any settings keys added since a season was first created (older
  // seasons may be missing seriesLength/oddsFormat/homeFieldBoost etc), and
  // any top-level season fields added later (divisions).
  const activeSeason = useMemo(() => activeSeasonRaw ? { ...activeSeasonRaw, settings: { ...DEFAULT_SETTINGS, ...activeSeasonRaw.settings }, divisions: activeSeasonRaw.divisions || [], activityLog: activeSeasonRaw.activityLog || [], futuresPicks: activeSeasonRaw.futuresPicks || {} } : null, [activeSeasonRaw]);
  const sport = useMemo(() => sportOf(league), [league]);

  const switchSeason = (seasonId) => { if (!league) return; const lg = { ...league, activeSeasonId: seasonId }; persistLeague(lg); setSelectedTeamId(null); setRoundIdx(0); setTab('home'); };
  const createSeason = (name, copyRoster) => {
    if (!league) return;
    const s = newSeason(name);
    if (copyRoster && activeSeason) s.members = activeSeason.members.map(m => ({ teamId: m.teamId, scheduleName: m.scheduleName, baselineW: 0, baselineL: 0, baselineRF: 0, baselineRA: 0, active: m.active }));
    const lg = { ...league, seasons: [...league.seasons, s], activeSeasonId: s.id };
    persistLeague(lg); setSelectedTeamId(null); setRoundIdx(0); setTab('home');
  };
  const renameSeason = (seasonId, name) => { if (!league) return; persistLeague({ ...league, seasons: league.seasons.map(s => s.id === seasonId ? { ...s, name } : s) }); };
  const deleteSeason = (seasonId) => {
    if (!league) return;
    const remaining = league.seasons.filter(s => s.id !== seasonId);
    const activeSeasonId = league.activeSeasonId === seasonId ? (remaining[0] ? remaining[0].id : null) : league.activeSeasonId;
    persistLeague({ ...league, seasons: remaining, activeSeasonId });
  };
  const setChampion = (seasonId, teamId) => { if (!league) return; persistLeague({ ...league, seasons: league.seasons.map(s => s.id === seasonId ? { ...s, championTeamId: teamId } : s) }); };

  /* ---- season roster ops ---- */
  const addExistingTeamToSeason = async (teamId) => {
    if (!league || !activeSeason) return;
    let t = teamsById[teamId];
    if (!t) { t = await loadObj(`team:${teamId}`); if (t) setTeamsById(prev => ({ ...prev, [teamId]: t })); }
    const member = { teamId, scheduleName: (t && t.name) || '', baselineW: 0, baselineL: 0, baselineRF: 0, baselineRA: 0, active: true };
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, members: [...s.members, member] } : s);
    persistLeague({ ...league, seasons });
  };
  const createAndAddTeamToSeason = async (name) => {
    const gt = await createGlobalTeam(name);
    if (!league || !activeSeason) return;
    const member = { teamId: gt.id, scheduleName: name, baselineW: 0, baselineL: 0, baselineRF: 0, baselineRA: 0, active: true };
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, members: [...s.members, member] } : s);
    persistLeague({ ...league, seasons });
    return gt;
  };
  const updateMemberField = (teamId, field, value) => {
    if (!league || !activeSeason) return;
    const numeric = ['baselineW', 'baselineL', 'baselineRF', 'baselineRA'];
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, members: s.members.map(m => m.teamId === teamId ? { ...m, [field]: numeric.includes(field) ? (Number(value) || 0) : value } : m) } : s);
    persistLeague({ ...league, seasons });
  };
  const removeMember = (teamId) => {
    if (!league || !activeSeason) return;
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, members: s.members.filter(m => m.teamId !== teamId) } : s);
    persistLeague({ ...league, seasons });
  };

  /* ---- divisions & conferences ---- */
  const addDivision = (name, conference) => {
    if (!league || !activeSeason) return;
    const div = newDivision(name, conference);
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, divisions: [...(s.divisions || []), div] } : s);
    persistLeague({ ...league, seasons });
  };
  const updateDivision = (divId, field, value) => {
    if (!league || !activeSeason) return;
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, divisions: (s.divisions || []).map(d => d.id === divId ? { ...d, [field]: value } : d) } : s);
    persistLeague({ ...league, seasons });
  };
  const removeDivision = (divId) => {
    if (!league || !activeSeason) return;
    if (!confirm('Delete this division? Teams in it will become unassigned.')) return;
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? {
      ...s,
      divisions: (s.divisions || []).filter(d => d.id !== divId),
      members: s.members.map(m => m.divisionId === divId ? { ...m, divisionId: null } : m),
    } : s);
    persistLeague({ ...league, seasons });
  };
  const assignMemberDivision = (teamId, divisionId) => updateMemberField(teamId, 'divisionId', divisionId || null);

  const updateMemberRoster = (teamId, updateFn) => {
    if (!league || !activeSeason) return;
    const seasons = league.seasons.map(s => {
      if (s.id !== activeSeason.id) return s;
      return { ...s, members: s.members.map(m => m.teamId === teamId ? { ...m, roster: updateFn(m.roster || []) } : m) };
    });
    persistLeague({ ...league, seasons });
  };
  const addPlayer = (teamId, name, starLevel) => updateMemberRoster(teamId, roster => [...roster, newPlayer(name, starLevel)]);
  const addPlayersBulk = (teamId, parsedRows) => updateMemberRoster(teamId, roster => [
    ...roster,
    ...parsedRows.filter(r => r.matched).map(r => ({ ...newPlayer(r.name, r.starLevel), number: r.number, position: r.position })),
  ]);
  const updatePlayerField = (teamId, playerId, field, value) => updateMemberRoster(teamId, roster => roster.map(p => p.id === playerId ? { ...p, [field]: value } : p));
  const removePlayer = (teamId, playerId) => updateMemberRoster(teamId, roster => roster.filter(p => p.id !== playerId));
  const tradePlayer = (fromTeamId, toTeamId, playerId) => {
    if (!league || !activeSeason || fromTeamId === toTeamId) return;
    let movedPlayer = null;
    const afterRemoval = activeSeason.members.map(m => {
      if (m.teamId !== fromTeamId) return m;
      const roster = m.roster || [];
      const idx = roster.findIndex(p => p.id === playerId);
      if (idx < 0) return m;
      movedPlayer = roster[idx];
      return { ...m, roster: roster.filter(p => p.id !== playerId) };
    });
    if (!movedPlayer) return;
    const finalMembers = afterRemoval.map(m => m.teamId === toTeamId ? { ...m, roster: [...(m.roster || []), movedPlayer] } : m);
    const fromName = (teamsById[fromTeamId] && teamsById[fromTeamId].name) || 'a team';
    const toName = (teamsById[toTeamId] && teamsById[toTeamId].name) || 'a team';
    const logEntry = { id: uid('act'), text: `${movedPlayer.name} traded from ${fromName} to ${toName}`, at: Date.now() };
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, members: finalMembers, activityLog: [...(s.activityLog || []), logEntry] } : s);
    persistLeague({ ...league, seasons });
  };

  // Imports a whole multi-team roster spreadsheet at once: for each team block,
  // finds a matching existing team (by name) or creates one, then merges in the
  // parsed players — updating role/star level for players that already exist
  // (matched by name) so re-importing an updated sheet doesn't wipe out stats
  // you've already entered, and adding anyone new.
  const importRosterSheet = async (blocks) => {
    if (!league || !activeSeason) return;
    const teamsByIdDraft = { ...teamsById };
    const teamsIndexDraft = [...teamsIndex];
    let membersDraft = [...activeSeason.members];

    for (const block of blocks) {
      const teamName = (block.teamName || '').trim();
      if (!teamName) continue;
      let memberIdx = membersDraft.findIndex(m => {
        const gt = teamsByIdDraft[m.teamId];
        return (gt && gt.name.toLowerCase() === teamName.toLowerCase()) || (m.scheduleName || '').toLowerCase() === teamName.toLowerCase();
      });
      if (memberIdx < 0) {
        let gt = Object.values(teamsByIdDraft).find(t => t.name.toLowerCase() === teamName.toLowerCase());
        if (!gt) {
          const idxEntry = teamsIndexDraft.find(t => t.name.toLowerCase() === teamName.toLowerCase());
          if (idxEntry) { gt = await loadObj(`team:${idxEntry.id}`); if (gt) teamsByIdDraft[idxEntry.id] = gt; }
        }
        if (!gt) {
          gt = { id: uid('t'), name: teamName, color: null, logoUrl: null, wordmarkUrl: null, createdAt: Date.now() };
          teamsByIdDraft[gt.id] = gt;
          teamsIndexDraft.push({ id: gt.id, name: gt.name });
          await saveObj(`team:${gt.id}`, gt);
        }
        membersDraft = [...membersDraft, { teamId: gt.id, scheduleName: teamName, baselineW: 0, baselineL: 0, baselineRF: 0, baselineRA: 0, active: true, roster: [] }];
        memberIdx = membersDraft.length - 1;
      }
      // Full replace, not merge: the sheet is the source of truth for this
      // team's roster on every import, so re-importing an updated sheet
      // can't leave stale players behind or create name-variant duplicates.
      // Dedupe within the sheet itself too (case-insensitive name), keeping
      // the last row if a name appears twice in one import.
      const seen = new Map();
      block.players.forEach(pl => { if (pl.name) seen.set(pl.name.toLowerCase(), pl); });
      const newRoster = [...seen.values()].map(pl => ({ ...newPlayer(pl.name, pl.starLevel), role: pl.role }));
      membersDraft = membersDraft.map((m, i) => i === memberIdx ? { ...m, roster: newRoster } : m);
    }

    setTeamsById(teamsByIdDraft);
    setTeamsIndex(teamsIndexDraft); saveList('teams-index', teamsIndexDraft);
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, members: membersDraft } : s);
    persistLeague({ ...league, seasons });
  };

  /* ---- awards ---- */
  const addAwardDef = (name, description) => {
    if (!league) return;
    const def = newAwardDef(name, description);
    persistLeague({ ...league, awardDefs: [...(league.awardDefs || []), def] });
  };
  const updateAwardDef = (id, field, value) => {
    if (!league) return;
    persistLeague({ ...league, awardDefs: (league.awardDefs || []).map(a => a.id === id ? { ...a, [field]: value } : a) });
  };
  const removeAwardDef = (id) => {
    if (!league) return;
    if (!confirm('Delete this award? Past winners recorded for it will be removed too.')) return;
    const seasons = league.seasons.map(s => {
      if (!s.awardWinners || !s.awardWinners[id]) return s;
      const aw = { ...s.awardWinners }; delete aw[id];
      return { ...s, awardWinners: aw };
    });
    persistLeague({ ...league, awardDefs: (league.awardDefs || []).filter(a => a.id !== id), seasons });
  };
  const setAwardWinner = (awardId, winner) => {
    if (!league || !activeSeason) return;
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, awardWinners: { ...(s.awardWinners || {}), [awardId]: winner } } : s);
    persistLeague({ ...league, seasons });
  };
  const clearAwardWinner = (awardId) => {
    if (!league || !activeSeason) return;
    const seasons = league.seasons.map(s => {
      if (s.id !== activeSeason.id || !s.awardWinners) return s;
      const aw = { ...s.awardWinners }; delete aw[awardId];
      return { ...s, awardWinners: aw };
    });
    persistLeague({ ...league, seasons });
  };
  const updateGlobalTeamField = (teamId, field, value) => {
    const gt = teamsById[teamId] || { id: teamId, name: (teamsIndex.find(t => t.id === teamId) || {}).name || '', color: null, logoUrl: null, wordmarkUrl: null, createdAt: Date.now() };
    const updated = { ...gt, [field]: value };
    setTeamsById(prev => ({ ...prev, [teamId]: updated }));
    queueSave(`team:${teamId}`, updated);
    if (field === 'name') { const idx = teamsIndex.map(t => t.id === teamId ? { ...t, name: value } : t); setTeamsIndex(idx); saveList('teams-index', idx); }
  };

  /* ---- schedule / games ops (act on active season) ---- */
  const resolveOrCreateMember = async (membersDraft, scheduleNameRaw, teamsByIdDraft, teamsIndexDraft) => {
    const scheduleName = scheduleNameRaw.trim();
    let m = membersDraft.find(m => (m.scheduleName || '').toLowerCase() === scheduleName.toLowerCase());
    if (m) return m.teamId;
    // check the FULL global roster (not just what's already loaded locally) so the same
    // team used across multiple seasons is reused instead of duplicated.
    let idxEntry = teamsIndexDraft.find(t => t.name.toLowerCase() === scheduleName.toLowerCase());
    let gt = idxEntry ? teamsByIdDraft[idxEntry.id] : null;
    if (idxEntry && !gt) { gt = await loadObj(`team:${idxEntry.id}`); if (gt) teamsByIdDraft[idxEntry.id] = gt; }
    if (!gt) {
      gt = { id: uid('t'), name: scheduleName, color: null, logoUrl: null, wordmarkUrl: null, createdAt: Date.now() };
      teamsByIdDraft[gt.id] = gt;
      teamsIndexDraft.push({ id: gt.id, name: gt.name });
      await saveObj(`team:${gt.id}`, gt);
    }
    const newMember = { teamId: gt.id, scheduleName, baselineW: 0, baselineL: 0, baselineRF: 0, baselineRA: 0, active: true };
    membersDraft.push(newMember);
    return gt.id;
  };

  const importGames = async (rows) => {
    if (!league || !activeSeason) return;
    const membersDraft = [...activeSeason.members];
    const teamsByIdDraft = { ...teamsById };
    const teamsIndexDraft = [...teamsIndex];
    const newGames = [];
    for (const r of rows) {
      const awayId = await resolveOrCreateMember(membersDraft, r.away, teamsByIdDraft, teamsIndexDraft);
      const homeId = await resolveOrCreateMember(membersDraft, r.home, teamsByIdDraft, teamsIndexDraft);
      const played = r.awayScore != null && r.homeScore != null;
      newGames.push({ id: uid('g'), date: r.date || '', awayTeamId: awayId, homeTeamId: homeId, awayScheduleName: r.away, homeScheduleName: r.home, awayScore: played ? r.awayScore : null, homeScore: played ? r.homeScore : null, innings: r.innings || (activeSeason.settings.standardInnings || 7), played });
    }
    setTeamsById(teamsByIdDraft);
    setTeamsIndex(teamsIndexDraft); saveList('teams-index', teamsIndexDraft);
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, members: membersDraft, games: [...s.games, ...newGames] } : s);
    persistLeague({ ...league, seasons });
  };
  const generateSchedule = (teamIds, roundsOfPlay) => {
    if (!league || !activeSeason || teamIds.length < 2) return;
    const pairs = generateRoundRobinSchedule(teamIds, roundsOfPlay);
    const newGames = pairs.map(p => {
      const away = teamsById[p.awayTeamId], home = teamsById[p.homeTeamId];
      return { id: uid('g'), date: String(p.round), awayTeamId: p.awayTeamId, homeTeamId: p.homeTeamId, awayScheduleName: away ? away.name : '', homeScheduleName: home ? home.name : '', awayScore: null, homeScore: null, innings: activeSeason.settings.standardInnings || 7, played: false };
    });
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, games: [...s.games, ...newGames], settings: { ...s.settings, scheduleMode: 'round' } } : s);
    persistLeague({ ...league, seasons });
  };
  const addManualGame = ({ date, awayTeamId, homeTeamId }) => {
    if (!league || !activeSeason) return;
    const away = teamsById[awayTeamId], home = teamsById[homeTeamId];
    // Normalize the round label the same way imported "Round N" headers are stored,
    // so a manually typed "Round 1" and an imported "Round 1" land in the same group
    // instead of silently splitting into two.
    let normalizedDate = date;
    if ((activeSeason.settings.scheduleMode || 'date') === 'round' && date) {
      const stripped = String(date).trim().replace(/^(round|rd|r|week|wk)\.?\s*#?\s*/i, '').trim();
      normalizedDate = stripped || date;
    }
    const g = { id: uid('g'), date: normalizedDate, awayTeamId, homeTeamId, awayScheduleName: away?.name, homeScheduleName: home?.name, awayScore: null, homeScore: null, innings: activeSeason.settings.standardInnings || 7, played: false };
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, games: [...s.games, g] } : s);
    persistLeague({ ...league, seasons });
  };
  const saveScore = (gameId, { awayScore, homeScore, innings }) => {
    if (!league || !activeSeason) return;
    const updatedGames = activeSeason.games.map(g => g.id === gameId ? { ...g, awayScore, homeScore, innings, played: true, isForfeit: false, forfeitBy: null, isOngoing: false } : g);
    const { games: afterPlayIn } = advancePlayIn(updatedGames);
    const { games, championTeamId } = advancePlayoffs(afterPlayIn, activeSeason.settings, seedById);
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, games, championTeamId: championTeamId !== undefined ? championTeamId : s.championTeamId } : s);
    persistLeague({ ...league, seasons });
  };
  const declareForfeit = (gameId, forfeitBy) => {
    if (!league || !activeSeason) return;
    const homeScore = forfeitBy === 'home' ? 0 : 9;
    const awayScore = forfeitBy === 'away' ? 0 : 9;
    const updatedGames = activeSeason.games.map(g => g.id === gameId ? { ...g, awayScore, homeScore, innings: 0, played: true, isForfeit: true, forfeitBy, winnerOverride: null, isOngoing: false } : g);
    const { games: afterPlayIn } = advancePlayIn(updatedGames);
    const { games, championTeamId } = advancePlayoffs(afterPlayIn, activeSeason.settings, seedById);
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, games, championTeamId: championTeamId !== undefined ? championTeamId : s.championTeamId } : s);
    persistLeague({ ...league, seasons });
  };
  // Marks a not-yet-final game as currently in progress — purely informational
  // (doesn't count toward standings/streaks, same as any unplayed game) but
  // surfaced with a "LIVE" badge in the schedule and its own panel on Home so
  // it's easy to see what's happening right now. Optionally carries a
  // live/in-progress score and period (inning/quarter/half, plus top/bottom
  // for sports that have it) for display only.
  const setGameOngoing = (gameId, ongoing, liveState) => {
    if (!league || !activeSeason) return;
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? {
      ...s, games: s.games.map(g => g.id === gameId ? {
        ...g,
        isOngoing: ongoing,
        liveAwayScore: ongoing ? (liveState ? liveState.away : g.liveAwayScore) : null,
        liveHomeScore: ongoing ? (liveState ? liveState.home : g.liveHomeScore) : null,
        livePeriod: ongoing ? (liveState ? liveState.period : g.livePeriod) : null,
        liveHalf: ongoing ? (liveState ? liveState.half : g.liveHalf) : null,
      } : g)
    } : s);
    persistLeague({ ...league, seasons });
  };
  const setWinnerOverride = (gameId, winnerOverride) => {
    if (!league || !activeSeason) return;
    const updatedGames = activeSeason.games.map(g => g.id === gameId ? { ...g, winnerOverride } : g);
    const { games: afterPlayIn } = advancePlayIn(updatedGames);
    const { games, championTeamId } = advancePlayoffs(afterPlayIn, activeSeason.settings, seedById);
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, games, championTeamId: championTeamId !== undefined ? championTeamId : s.championTeamId } : s);
    persistLeague({ ...league, seasons });
  };
  // Swaps which team is "home" vs "away" on a game — purely a relabeling, so
  // scores, live state, forfeit side, and any winner override all swap along
  // with it to keep pointing at the same actual result. Doesn't touch which
  // team actually won, so no need to re-run playoff advancement.
  const swapHomeAway = (gameId) => {
    if (!league || !activeSeason) return;
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? {
      ...s, games: s.games.map(g => g.id === gameId ? {
        ...g,
        homeTeamId: g.awayTeamId, awayTeamId: g.homeTeamId,
        homeScheduleName: g.awayScheduleName, awayScheduleName: g.homeScheduleName,
        homeScore: g.awayScore, awayScore: g.homeScore,
        liveHomeScore: g.liveAwayScore ?? null, liveAwayScore: g.liveHomeScore ?? null,
        winnerOverride: g.winnerOverride === 'home' ? 'away' : g.winnerOverride === 'away' ? 'home' : g.winnerOverride,
        forfeitBy: g.forfeitBy === 'home' ? 'away' : g.forfeitBy === 'away' ? 'home' : g.forfeitBy,
      } : g)
    } : s);
    persistLeague({ ...league, seasons });
  };
  const startPlayIn = () => {
    if (!league || !activeSeason) return;
    if (activeSeason.games.some(g => g.isPlayIn)) return;
    const std = computeStandings(activeSeason, teamsById).active;
    const round1 = generatePlayInRound1(std, activeSeason.settings.playoffSpots, activeSeason.settings.playInTeams || 0);
    if (round1.length === 0) return;
    const { games } = advancePlayIn([...activeSeason.games, ...round1]);
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, games } : s);
    persistLeague({ ...league, seasons });
  };
  const clearPlayIn = () => {
    if (!league || !activeSeason) return;
    const games = activeSeason.games.filter(g => !g.isPlayIn);
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, games } : s);
    persistLeague({ ...league, seasons });
  };
  const startPlayoffs = () => {
    if (!league || !activeSeason) return;
    if (activeSeason.games.some(g => g.isPlayoff)) return;
    const playInWinnerId = getPlayInWinner(activeSeason.games);
    if ((activeSeason.settings.playInTeams || 0) >= 2 && !playInWinnerId) return;
    const std = buildMainBracketSeeds(computeStandings(activeSeason, teamsById).active, activeSeason.settings, playInWinnerId);
    const round1 = generatePlayoffRound1(std, activeSeason.settings.playoffSpots, activeSeason.settings.seriesLength);
    if (round1.length === 0) return;
    const { games, championTeamId } = advancePlayoffs([...activeSeason.games, ...round1], activeSeason.settings, seedById);
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, games, championTeamId: championTeamId !== undefined ? championTeamId : s.championTeamId } : s);
    persistLeague({ ...league, seasons });
  };
  const clearPlayoffs = () => {
    if (!league || !activeSeason) return;
    const games = activeSeason.games.filter(g => !g.isPlayoff);
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, games, championTeamId: null } : s);
    persistLeague({ ...league, seasons });
  };
  const deleteGame = (gameId) => {
    if (!league || !activeSeason) return;
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, games: s.games.filter(g => g.id !== gameId) } : s);
    persistLeague({ ...league, seasons });
  };
  const updateGameNotes = (gameId, notes) => {
    if (!league || !activeSeason) return;
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, games: s.games.map(g => g.id === gameId ? { ...g, notes } : g) } : s);
    persistLeague({ ...league, seasons });
  };
  const saveSettings = (settings) => {
    if (!league || !activeSeason) return;
    const seasons = league.seasons.map(s => s.id === activeSeason.id ? { ...s, settings } : s);
    persistLeague({ ...league, seasons });
  };

  /* ---- navigation helpers ---- */
  const onOpenTeam = (teamId) => { setSelectedTeamId(teamId); setPrevTab(tab === 'team' || tab === 'compare' ? prevTab : tab); setTab('team'); };
  const backFromTeam = () => { setTab(prevTab); setSelectedTeamId(null); };
  const onOpenCompare = (teamId) => { setCompareInitialId(teamId); setPrevTab(tab === 'team' || tab === 'compare' ? prevTab : tab); setTab('compare'); };
  const backFromCompare = () => { setTab(prevTab); setCompareInitialId(null); };

  /* ---- derived data ---- */
  const teamChampionshipCounts = useMemo(() => {
    const counts = {};
    if (league) league.seasons.forEach(s => { if (s.championTeamId) counts[s.championTeamId] = (counts[s.championTeamId] || 0) + 1; });
    return counts;
  }, [league]);
  const standingsResult = useMemo(() => activeSeason ? computeStandings(activeSeason, teamsById) : { all: [], active: [] }, [activeSeason, teamsById]);
  const standings = standingsResult.active;
  // Seed lookup used for reseeding rounds (best remaining seed vs. worst
  // remaining seed) — built from the standings order, same as bracket seeding.
  const seedById = useMemo(() => { const m = {}; standings.forEach((t, i) => { m[t.id] = i + 1; }); return m; }, [standings]);
  const rounds = useMemo(() => activeSeason ? getOrderedRounds(activeSeason) : [], [activeSeason]);
  // Re-derive the "current round" whenever games are added OR whenever a
  // game's played status changes (entering a score doesn't change the game
  // COUNT, so that alone was never re-triggering this — the home page would
  // stay stuck on round 1 as soon as it was first computed).
  const playedCount = activeSeason ? (activeSeason.games || []).filter(g => g.played).length : 0;
  useEffect(() => { if (rounds.length) setRoundIdx(currentRoundIndex(rounds)); }, [activeSeason?.id, activeSeason?.games?.length, playedCount]);
  const movementById = useMemo(() => {
    if (!activeSeason || rounds.length < 2) return {};
    const curIdx = lastPlayedRoundIndex(rounds);
    if (curIdx < 1) return {};
    const prev = computeStandingsThroughRound(activeSeason, teamsById, rounds, curIdx - 1).active;
    const prevRankById = {};
    prev.forEach(t => { prevRankById[t.id] = t.rank; });
    const map = {};
    standings.forEach(t => { if (prevRankById[t.id] != null) map[t.id] = prevRankById[t.id] - t.rank; });
    return map;
  }, [activeSeason, teamsById, rounds, standings]);
  const roundHistory = useMemo(() => activeSeason ? computeRoundHistory(activeSeason, teamsById, rounds) : [], [activeSeason, teamsById, rounds]);
  const scoringTrend = useMemo(() => computeScoringTrend(rounds), [rounds]);
  const extras = useMemo(() => activeSeason ? computeExtras(activeSeason, teamsById) : null, [activeSeason, teamsById]);
  const leagueRecords = useMemo(() => computeLeagueRecords(league, teamsById), [league, teamsById]);
  const h2hMatrix = useMemo(() => activeSeason ? buildH2H(activeSeason.games) : {}, [activeSeason]);
  const selectedTeam = useMemo(() => selectedTeamId ? (teamsById[selectedTeamId] ? { ...teamsById[selectedTeamId] } : null) : null, [selectedTeamId, teamsById]);
  const selectedTeamMerged = useMemo(() => {
    if (!selectedTeamId || !activeSeason) return null;
    const member = activeSeason.members.find(m => m.teamId === selectedTeamId);
    if (!member) return null;
    return mergeTeam(teamsById[selectedTeamId] || null, member);
  }, [selectedTeamId, activeSeason, teamsById]);
  const selectedStandingsRow = useMemo(() => standingsResult.all.find(t => t.id === selectedTeamId) || null, [standingsResult, selectedTeamId]);
  const historyTeam = historyTeamId ? teamsById[historyTeamId] : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: INK, color: CHALK_DIM }}>Loading…</div>;

  /* ---- render ---- */
  let body = null;
  if (screen === 'leagues') {
    body = <LeaguesView index={leaguesIndex} onOpen={openLeague} onCreate={createLeague} onDelete={deleteLeagueById} onRename={renameLeague} onRefresh={refreshIndexes} loadError={loadError} onOpenRegistry={openRegistry} onOpenAppearance={() => setScreen('appearance')} />;
  } else if (screen === 'appearance') {
    body = (
      <div className="p-4 space-y-4">
        <button onClick={() => setScreen('leagues')} className="flex items-center gap-1 text-sm" style={{ color: CHALK_DIM }}><ArrowLeft size={14} /> Back</button>
        <AppearanceSettings theme={theme} saveTheme={saveTheme} />
      </div>
    );
  } else if (screen === 'registry') {
    body = <TeamRegistryView teamsIndex={teamsIndex} teamsById={teamsById} onBack={() => setScreen('leagues')} onCreate={createGlobalTeam} onOpenHistory={(id) => openTeamHistory(id, 'registry')} updateGlobalTeamField={updateGlobalTeamField} />;
  } else if (screen === 'history') {
    body = <TeamHistoryPage team={historyTeam} history={historyData} loading={historyLoading} onBack={() => setScreen(historyBack)} />;
  } else if (screen === 'league' && league) {
    if (tab === 'seasons') {
      body = <SeasonsView league={league} onBack={() => setTab('home')} onSwitch={switchSeason} onCreate={createSeason} onRename={renameSeason} onDelete={deleteSeason} onSetChampion={setChampion} teamsById={teamsById} onSetTagline={setLeagueTagline} />;
    } else if (!activeSeason) {
      body = <div className="p-4"><Panel><p className="px-4 py-8 text-sm text-center" style={{ color: CHALK_DIM }}>This league has no seasons yet.</p></Panel></div>;
    } else if (tab === 'home') {
      body = <HomeView season={activeSeason} rounds={rounds} roundIdx={Math.min(roundIdx, Math.max(0, rounds.length - 1))} setRoundIdx={setRoundIdx} teamsById={teamsById} settings={activeSeason.settings} onOpenTeam={onOpenTeam} h2hMatrix={h2hMatrix} sport={sport} />;
    } else if (tab === 'standings') {
      body = <StandingsView standings={standings} updateMemberField={updateMemberField} season={activeSeason} settings={activeSeason.settings} movementById={movementById} onOpenTeam={onOpenTeam} />;
    } else if (tab === 'teams') {
      body = <TeamsView season={activeSeason} teamsById={teamsById} teamsIndex={teamsIndex} addExistingTeam={addExistingTeamToSeason} createAndAddTeam={createAndAddTeamToSeason} updateMemberField={updateMemberField} updateGlobalTeamField={updateGlobalTeamField} removeMember={removeMember} onOpenTeam={onOpenTeam} importRosterSheet={importRosterSheet} addDivision={addDivision} updateDivision={updateDivision} removeDivision={removeDivision} assignMemberDivision={assignMemberDivision} />;
    } else if (tab === 'schedule') {
      body = <ScheduleView season={activeSeason} settings={activeSeason.settings} importGames={importGames} addManualGame={addManualGame} saveScore={saveScore} deleteGame={deleteGame} declareForfeit={declareForfeit} setWinnerOverride={setWinnerOverride} teamsById={teamsById} sport={sport} generateSchedule={generateSchedule} updateGameNotes={updateGameNotes} setGameOngoing={setGameOngoing} swapHomeAway={swapHomeAway} />;
    } else if (tab === 'stats') {
      body = <StatsView standings={standings} onOpenTeam={onOpenTeam} season={activeSeason} />;
    } else if (tab === 'awards') {
      body = <AwardsView league={league} season={activeSeason} standings={standings} teamsById={teamsById} addAwardDef={addAwardDef} updateAwardDef={updateAwardDef} removeAwardDef={removeAwardDef} setAwardWinner={setAwardWinner} clearAwardWinner={clearAwardWinner} />;
    } else if (tab === 'odds') {
      body = <OddsView season={activeSeason} teamsById={teamsById} standings={standings} settings={activeSeason.settings} onOpenTeam={onOpenTeam} h2hMatrix={h2hMatrix} onStartPlayoffs={startPlayoffs} onClearPlayoffs={clearPlayoffs} onStartPlayIn={startPlayIn} onClearPlayIn={clearPlayIn} />;
    } else if (tab === 'extras') {
      body = <ExtrasView extras={extras} teamsById={teamsById} leagueRecords={leagueRecords} activityLog={activeSeason.activityLog || []} season={activeSeason} standings={standings} />;
    } else if (tab === 'graphs') {
      body = <GraphsView league={Object.values(teamsById).filter(t => activeSeason.members.some(m => m.teamId === t.id))} roundHistory={roundHistory} standings={standings} scoringTrend={scoringTrend} season={activeSeason} h2hMatrix={h2hMatrix} onOpenTeam={onOpenTeam} sport={sport} />;
    } else if (tab === 'settings') {
      body = <SettingsView settings={activeSeason.settings} saveSettings={saveSettings} theme={theme} saveTheme={saveTheme} sport={sport} />;
    } else if (tab === 'team') {
      body = <TeamPage season={activeSeason} settings={activeSeason.settings} team={selectedTeamMerged} standingsRow={selectedStandingsRow} teamsById={teamsById} h2hMatrix={h2hMatrix} championshipCount={selectedTeamId ? (teamChampionshipCounts[selectedTeamId] || 0) : 0} onBack={backFromTeam} onOpenGlobalHistory={(id) => openTeamHistory(id, 'league')} onOpenCompare={onOpenCompare} updatePlayerField={updatePlayerField} removePlayer={removePlayer} addPlayer={addPlayer} addPlayersBulk={addPlayersBulk} tradePlayer={tradePlayer} updateMemberField={updateMemberField} />;
    } else if (tab === 'compare') {
      body = <ComparePage season={activeSeason} standingsAll={standingsResult.all} teamsById={teamsById} h2hMatrix={h2hMatrix} initialTeamId={compareInitialId} onBack={backFromCompare} onOpenTeam={onOpenTeam} />;
    }
  }

  const inSeasonTabs = screen === 'league' && league && activeSeason && tab !== 'seasons';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: INK, color: CHALK, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <header className="px-4 pt-4 pb-3" style={{ background: `linear-gradient(160deg, ${PANEL2}, ${INK})`, borderBottom: `2px solid ${PRIMARY}` }}>
        <div className="flex items-center gap-2">
          {screen === 'league' && !FIXED_LEAGUE_ID && <button onClick={backToLeagues} className="p-1 rounded" style={{ color: CHALK_DIM }}><ArrowLeft size={18} /></button>}
          {(screen === 'registry' || screen === 'history') && screen !== 'league' && <button onClick={() => setScreen(screen === 'history' ? historyBack : 'leagues')} className="p-1 rounded" style={{ color: CHALK_DIM }}><ArrowLeft size={18} /></button>}
          <Trophy size={20} style={{ color: PRIMARY }} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: CHALK_DIM }}>{screen === 'league' && league && league.tagline ? league.tagline : 'League Tracker'}</div>
            <h1 className="text-lg font-black tracking-tight truncate" style={{ color: CHALK }}>
              {screen === 'league' && league ? league.name : screen === 'registry' ? 'All Teams' : screen === 'history' ? 'Team History' : screen === 'appearance' ? 'Settings & Appearance' : 'Your Leagues'}
            </h1>
          </div>
          {screen === 'league' && league && (
            <button onClick={() => setTab('seasons')} className="p-1.5 rounded flex-shrink-0" style={{ color: PRIMARY }}><Layers size={18} /></button>
          )}
          {screen === 'league' && isLoggedIn && (
            saveStatus === 'error' ? (
              <button onClick={retrySave} className="text-[10px] font-bold underline flex-shrink-0" style={{ color: NEGATIVE }}>Save failed — Retry</button>
            ) : (
              <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: CHALK_DIM }}>
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''}
              </span>
            )
          )}
          <LoginControl chalk={CHALK} chalkDim={CHALK_DIM} primary={PRIMARY} ink={INK} panel={PANEL} panel2={PANEL2} line={LINE} />
        </div>
        {screen === 'league' && activeSeason && standings[0] && tab !== 'seasons' && (
          <div className="mt-3 flex items-center gap-3 overflow-x-auto pb-1">
            <div className="flex-shrink-0 px-3 py-1.5 rounded-lg" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
              <div className="text-[9px] uppercase" style={{ color: CHALK_DIM }}>{activeSeason.name}</div>
              <div className="text-sm font-mono font-bold" style={{ color: WIN }}>{standings[0].displayName} leads</div>
            </div>
            <div className="flex-shrink-0 px-3 py-1.5 rounded-lg" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
              <div className="text-[9px] uppercase" style={{ color: CHALK_DIM }}>Games</div>
              <div className="text-sm font-mono font-bold" style={{ color: CHALK }}>{activeSeason.games.filter(g => g.played).length}/{activeSeason.games.length}</div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-20">{body}</main>

      {inSeasonTabs && (
        <nav className="fixed bottom-0 left-0 right-0 flex gap-1 px-2 py-2 overflow-x-auto" style={{ background: PANEL, borderTop: `1px solid ${LINE}` }}>
          <TabBtn active={tab === 'home'} onClick={() => setTab('home')} icon={HomeIcon} label="Home" />
          <TabBtn active={tab === 'standings'} onClick={() => setTab('standings')} icon={Trophy} label="Standings" />
          <TabBtn active={tab === 'teams'} onClick={() => setTab('teams')} icon={Users} label="Teams" />
          <TabBtn active={tab === 'schedule'} onClick={() => setTab('schedule')} icon={Calendar} label="Schedule" />
          <TabBtn active={tab === 'stats'} onClick={() => setTab('stats')} icon={Activity} label="Stats" />
          <TabBtn active={tab === 'awards'} onClick={() => setTab('awards')} icon={AwardIcon} label="Awards" />
          <TabBtn active={tab === 'odds'} onClick={() => setTab('odds')} icon={Percent} label="Odds" />
          <TabBtn active={tab === 'extras'} onClick={() => setTab('extras')} icon={Sparkles} label="Extras" />
          <TabBtn active={tab === 'graphs'} onClick={() => setTab('graphs')} icon={BarChart3} label="Graphs" />
          <TabBtn active={tab === 'settings'} onClick={() => setTab('settings')} icon={SettingsIcon} label="Settings" />
        </nav>
      )}
    </div>
  );
}

export default function LeagueTracker() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

