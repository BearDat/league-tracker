import { gameWinner, uid } from '../league/core.js';
import { getSeriesLength, seriesWinsNeeded } from '../league/playoffs.js';

function involvesBoth(game, aId, bId) {
  const ids = [game.homeTeamId, game.awayTeamId];
  return ids.includes(aId) && ids.includes(bId);
}

export function planPlayoffContinuation(season, aId, bId) {
  const settings = season.settings || {};
  const between = (season.games || []).filter(g => g.isPlayoff && !g.isBye && involvesBoth(g, aId, bId));
  if (between.length === 0) return null;

  const groups = new Map();
  between.forEach(g => {
    const key = `${g.playoffRound || 0}:${g.bracketSlot == null ? 'x' : g.bracketSlot}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  });

  let series = null;
  groups.forEach(list => {
    if (!series || (list[0].playoffRound || 0) > (series[0].playoffRound || 0)) series = list;
  });
  if (!series) return null;

  const round = series[0].playoffRound;
  const slot = series[0].bracketSlot;
  const seriesLength = getSeriesLength(settings, round);
  const winsNeeded = seriesWinsNeeded(seriesLength);

  const wins = {};
  series.forEach(g => {
    if (!g.played) return;
    const w = gameWinner(g);
    const wid = w === 'home' ? g.homeTeamId : w === 'away' ? g.awayTeamId : null;
    if (wid != null) wins[wid] = (wins[wid] || 0) + 1;
  });
  if ((wins[aId] || 0) >= winsNeeded || (wins[bId] || 0) >= winsNeeded) {
    return { blocked: 'that series is already decided' };
  }

  const gamesPlayed = series.filter(g => g.played).length;
  if (gamesPlayed >= seriesLength) {
    return { blocked: `that series already has all ${seriesLength} games` };
  }

  const nextGameNum = gamesPlayed + 1;
  if (series.some(g => (g.seriesGame || 1) === nextGameNum && !g.played)) return null;

  const ordered = series.slice().sort((a, b) => (a.seriesGame || 1) - (b.seriesGame || 1));
  const higherSeedId = ordered[0].higherSeedId || ordered[0].homeTeamId;
  const lowerSeedId = higherSeedId === aId ? bId : aId;
  const hostId = nextGameNum % 2 === 1 ? higherSeedId : lowerSeedId;
  const awayId = hostId === higherSeedId ? lowerSeedId : higherSeedId;

  return {
    game: {
      id: uid('g'),
      date: `Playoffs R${round}`,
      isPlayoff: true,
      playoffRound: round,
      bracketSlot: slot,
      seriesGame: nextGameNum,
      higherSeedId,
      homeTeamId: hostId,
      awayTeamId: awayId,
      awayScheduleName: null,
      homeScheduleName: null,
      awayScore: null,
      homeScore: null,
      innings: null,
      played: false,
    },
    round,
    slot,
    nextGameNum,
    seriesLength,
    wins,
  };
}

export function findScheduledGame(season, aId, bId) {
  const all = (season.games || []).filter(g => !g.isBye && involvesBoth(g, aId, bId));
  const unplayed = all.filter(g => !g.played);

  if (unplayed.length === 0) {
    const played = all.length > 0;
    return {
      game: null,
      candidates: [],
      confidence: 'none',
      reason: played
        ? 'every scheduled game between these teams is already marked played'
        : 'no scheduled game between these teams',
    };
  }

  if (unplayed.length === 1) {
    return { game: unplayed[0], candidates: unplayed, confidence: 'high', reason: null };
  }

  const slots = new Set(unplayed.map(g => `${g.isPlayoff ? 'po' : g.isPlayIn ? 'pi' : 'rs'}:${g.playoffRound || g.playInRound || 0}:${g.bracketSlot == null ? 'x' : g.bracketSlot}`));
  if (slots.size === 1 && unplayed.every(g => g.isPlayoff || g.isPlayIn)) {
    const next = unplayed.slice().sort((a, b) => (a.seriesGame || 1) - (b.seriesGame || 1))[0];
    return { game: next, candidates: unplayed, confidence: 'high', reason: null };
  }

  const sorted = unplayed.slice().sort((a, b) => {
    if (a.gameTimeUTC != null && b.gameTimeUTC != null) return a.gameTimeUTC - b.gameTimeUTC;
    if (a.gameTimeUTC != null) return -1;
    if (b.gameTimeUTC != null) return 1;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });
  return {
    game: sorted[0],
    candidates: unplayed,
    confidence: 'low',
    reason: `${unplayed.length} unplayed games between these teams — pick the right one`,
  };
}

export function orientScores(game, leftTeamId, leftScore, rightTeamId, rightScore) {
  if (game.homeTeamId === leftTeamId && game.awayTeamId === rightTeamId) {
    return { homeScore: leftScore, awayScore: rightScore };
  }
  if (game.awayTeamId === leftTeamId && game.homeTeamId === rightTeamId) {
    return { awayScore: leftScore, homeScore: rightScore };
  }
  return null;
}

export function describeGame(game, nameFor) {
  const away = nameFor(game.awayTeamId);
  const home = nameFor(game.homeTeamId);
  const label = game.isPlayoff
    ? `Playoffs R${game.playoffRound} G${game.seriesGame || 1}`
    : game.isPlayIn
      ? `Play-In R${game.playInRound}`
      : game.date || 'Regular season';
  return `${away} @ ${home} — ${label}`;
}
