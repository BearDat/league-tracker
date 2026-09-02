import { playerSlug, seasonTeam, awardsForPlayer, hallOfFameFor } from './awards.js';
import { normalizeStatRow, sumPlayerTotals, addTotals, computeBattingAdvanced, computePitchingAdvanced } from './stats.js';

export function buildPlayer(snapshot, slug) {
  if (!snapshot) return null;
  const seasons = [];
  let name = null;

  (snapshot.seasons || []).forEach(season => {
    const entries = [];
    (season.members || []).forEach(member => {
      (member.roster || []).forEach(p => {
        if (playerSlug(p.name) === slug) entries.push({ player: p, teamId: member.teamId });
      });
    });
    (season.freeAgents || []).forEach(p => {
      if (playerSlug(p.name) === slug) entries.push({ player: p, teamId: null });
    });
    if (entries.length === 0) return;

    const ids = new Set(entries.map(e => e.player.id));
    const rows = (season.importedStatLines || [])
      .filter(line => ids.has(line.playerId) && !line.isPlayoff)
      .map(normalizeStatRow);
    const totals = sumPlayerTotals(rows);
    name = name || entries[0].player.name;

    seasons.push({
      id: season.id,
      name: season.name,
      player: entries[0].player,
      team: seasonTeam(season, snapshot.teams, entries[0].teamId),
      hasStats: rows.length > 0,
      totals,
      batting: computeBattingAdvanced(totals),
      pitching: computePitchingAdvanced(totals),
    });
  });

  if (seasons.length === 0) return null;

  const withStats = seasons.filter(s => s.hasStats);
  const careerTotals = addTotals(withStats.map(s => s.totals));
  const current = seasons.find(s => s.id === snapshot.activeSeasonId) || seasons[0];
  return {
    slug,
    name,
    seasons,
    current,
    hasStats: withStats.length > 0,
    career: {
      totals: careerTotals,
      batting: computeBattingAdvanced(careerTotals),
      pitching: computePitchingAdvanced(careerTotals),
    },
    awards: awardsForPlayer(snapshot, slug),
    hallOfFame: hallOfFameFor(snapshot, slug),
  };
}
