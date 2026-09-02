import { gameWinner, mergeTeam, teamSlug } from './core.js';
import { decorateGame } from './standings.js';

export function seriesWinsNeeded(seriesLength) {
  return Math.ceil((seriesLength || 1) / 2);
}

export function getSeriesLength(settings, round) {
  if (settings && Array.isArray(settings.seriesLengths) && settings.seriesLengths.length > 0) {
    if (settings.seriesLengths[round - 1]) return settings.seriesLengths[round - 1];
    return settings.seriesLengths[settings.seriesLengths.length - 1] || (settings.seriesLength || 1);
  }
  return (settings && settings.seriesLength) || 1;
}

export function getPlayoffRoundName(settings, round, roundsCount) {
  const custom = settings && settings.playoffRoundNames && settings.playoffRoundNames[String(round)];
  if (custom && custom.trim()) return custom.trim();
  if (roundsCount && round === roundsCount) return 'Final';
  if (roundsCount && round === roundsCount - 1) return 'Semifinals';
  return `Round ${round}`;
}

export function isPostseason(season) {
  return (season.games || []).some(g => g.isPlayoff || g.isPlayIn);
}

export function buildBracket(season, teamsById) {
  const settings = season.settings || {};
  const playoffGames = (season.games || []).filter(g => g.isPlayoff);
  if (playoffGames.length === 0) {
    return { active: false, rounds: [], championTeamId: season.championTeamId || null };
  }

  const teamOf = (teamId) => {
    if (!teamId) return null;
    const member = (season.members || []).find(m => m.teamId === teamId);
    if (!member) return null;
    const merged = mergeTeam(teamsById[teamId] || null, member);
    return {
      id: merged.id,
      name: merged.displayName,
      abbr: merged.abbr,
      color: merged.color,
      logoUrl: merged.logoUrl,
      slug: teamSlug(merged.displayName),
    };
  };

  const roundNums = [...new Set(playoffGames.map(g => g.playoffRound))].sort((a, b) => a - b);
  const roundsCount = roundNums.length;

  const rounds = roundNums.map(round => {
    const seriesLength = getSeriesLength(settings, round);
    const winsNeeded = seriesWinsNeeded(seriesLength);
    const roundGames = playoffGames.filter(g => g.playoffRound === round);
    const slots = [...new Set(roundGames.map(g => g.bracketSlot))].sort((a, b) => a - b);

    const series = slots.map(slot => {
      const slotGames = roundGames
        .filter(g => g.bracketSlot === slot)
        .sort((a, b) => (a.seriesGame || 1) - (b.seriesGame || 1));

      const ids = [];
      slotGames.forEach(g => {
        if (g.homeTeamId && !ids.includes(g.homeTeamId)) ids.push(g.homeTeamId);
        if (g.awayTeamId && !ids.includes(g.awayTeamId)) ids.push(g.awayTeamId);
      });

      const wins = {};
      ids.forEach(id => { wins[id] = 0; });
      slotGames.forEach(g => {
        if (!g.played) return;
        const w = gameWinner(g);
        const wid = w === 'home' ? g.homeTeamId : w === 'away' ? g.awayTeamId : null;
        if (wid != null) wins[wid] = (wins[wid] || 0) + 1;
      });

      const higherSeedId = slotGames[0] ? (slotGames[0].higherSeedId || slotGames[0].homeTeamId) : null;
      const ordered = ids.slice().sort((a, b) => (a === higherSeedId ? -1 : b === higherSeedId ? 1 : 0));
      const winnerId = ids.find(id => wins[id] >= winsNeeded) || null;
      const isBye = slotGames.length === 1 && slotGames[0].isBye;

      return {
        slot,
        isBye,
        seriesLength,
        winsNeeded,
        winnerId,
        decided: !!winnerId,
        teams: ordered.map(id => ({ team: teamOf(id), wins: wins[id] || 0, isWinner: id === winnerId })),
        games: slotGames.filter(g => !g.isBye).map(g => decorateGame(g, season, teamsById)),
      };
    });

    return {
      round,
      name: getPlayoffRoundName(settings, round, roundsCount),
      seriesLength,
      winsNeeded,
      series,
      complete: series.every(s => s.decided),
    };
  });

  return {
    active: true,
    rounds,
    roundsCount,
    championTeamId: season.championTeamId || null,
    champion: season.championTeamId ? teamOf(season.championTeamId) : null,
  };
}
