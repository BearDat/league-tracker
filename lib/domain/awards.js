import { mergeTeam, teamSlug } from './core.js';

export function playerSlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeAwardWinners(raw) {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export function seasonTeam(season, teamsById, teamId) {
  if (!teamId) return null;
  const member = (season.members || []).find(m => m.teamId === teamId);
  if (!member) {
    const global = teamsById[teamId];
    return global ? { ...global, slug: teamSlug(global.name) } : null;
  }
  const merged = mergeTeam(teamsById[teamId] || null, member);
  return {
    id: merged.id,
    name: merged.displayName,
    abbr: merged.abbr,
    color: merged.color,
    logoUrl: merged.logoUrl,
    slug: teamSlug(merged.displayName),
  };
}

export function findSeasonPlayerById(season, playerId) {
  for (const member of season.members || []) {
    const hit = (member.roster || []).find(p => p.id === playerId);
    if (hit) return { player: hit, teamId: member.teamId };
  }
  const fa = (season.freeAgents || []).find(p => p.id === playerId);
  return fa ? { player: fa, teamId: null } : null;
}

function resolveWinner(winner, season, teamsById) {
  if (winner.type === 'team') {
    const team = seasonTeam(season, teamsById, winner.teamId);
    return { kind: 'team', name: team ? team.name : 'Unknown team', team };
  }
  const hit = winner.playerId ? findSeasonPlayerById(season, winner.playerId) : null;
  const name = hit ? hit.player.name : (winner.name || 'Unknown player');
  const teamId = hit ? hit.teamId : winner.teamId;
  return {
    kind: 'player',
    name,
    slug: playerSlug(name),
    team: seasonTeam(season, teamsById, teamId),
    onRoster: !!hit,
  };
}

export function seasonAwards(snapshot, season) {
  const winners = season.awardWinners || {};
  const defs = snapshot.awardDefs || [];
  const order = new Map(defs.map((d, i) => [d.id, i]));
  return Object.keys(winners)
    .map(awardId => {
      const def = defs.find(d => d.id === awardId);
      return {
        id: awardId,
        name: def ? def.name : 'Retired award',
        description: def ? def.description : '',
        known: !!def,
        winners: normalizeAwardWinners(winners[awardId]).map(w => resolveWinner(w, season, snapshot.teams)),
      };
    })
    .filter(a => a.winners.length > 0)
    .sort((a, b) => (order.has(a.id) ? order.get(a.id) : 999) - (order.has(b.id) ? order.get(b.id) : 999));
}

export function awardsForPlayer(snapshot, slug) {
  const out = [];
  (snapshot.seasons || []).forEach(season => {
    seasonAwards(snapshot, season).forEach(award => {
      award.winners.forEach(w => {
        if (w.kind === 'player' && w.slug === slug) {
          out.push({ awardId: award.id, award: award.name, seasonId: season.id, seasonName: season.name });
        }
      });
    });
    if (season.championTeamId) {
      const member = (season.members || []).find(m => m.teamId === season.championTeamId);
      const onIt = member && (member.roster || []).some(p => playerSlug(p.name) === slug);
      if (onIt) {
        const team = seasonTeam(season, snapshot.teams, season.championTeamId);
        out.push({ awardId: 'champion', award: `${team ? team.name : 'League'} — champion`, seasonId: season.id, seasonName: season.name, isChampionship: true });
      }
    }
  });
  return out;
}

export function playerSlugIndex(snapshot) {
  const slugs = new Set();
  if (!snapshot) return slugs;
  (snapshot.seasons || []).forEach(season => {
    (season.members || []).forEach(member => {
      (member.roster || []).forEach(p => slugs.add(playerSlug(p.name)));
    });
    (season.freeAgents || []).forEach(p => slugs.add(playerSlug(p.name)));
  });
  return slugs;
}

export function hallOfFameEntries(snapshot) {
  return [...(snapshot.hallOfFame || [])]
    .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
    .map(entry => ({
      ...entry,
      slug: entry.playerName ? playerSlug(entry.playerName) : null,
    }));
}

export function hallOfFameFor(snapshot, slug) {
  return hallOfFameEntries(snapshot).find(e => e.slug === slug) || null;
}
