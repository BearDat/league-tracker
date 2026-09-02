function involvesBoth(game, aId, bId) {
  const ids = [game.homeTeamId, game.awayTeamId];
  return ids.includes(aId) && ids.includes(bId);
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
