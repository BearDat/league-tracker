import { uid } from './core.js';
import { advancePlayIn, advancePlayoffs } from './advance.js';

class ApplyError extends Error {}

function activeSeasonOf(league) {
  const seasons = league.seasons || [];
  return seasons.find(s => s.id === league.activeSeasonId) || seasons[seasons.length - 1] || null;
}

function replaceSeason(league, seasonId, updater) {
  return { ...league, seasons: (league.seasons || []).map(s => (s.id === seasonId ? updater(s) : s)) };
}

function stripOddsCache(season) {
  const next = { ...season };
  delete next.oddsCache;
  return next;
}

function ownerOf(season, playerId) {
  return (season.members || []).find(m => (m.roster || []).some(p => p.id === playerId)) || null;
}

function appendActivity(season, entry) {
  return [...(season.activityLog || []), { id: uid('act'), at: Date.now(), ...entry }];
}

function applyFinalScore(league, item, seedById) {
  const season = activeSeasonOf(league);
  const existing = (season.games || []).find(g => g.id === item.gameId);
  if (!existing && !item.newGame) throw new ApplyError('That game is no longer on the schedule.');
  if (existing && existing.played) throw new ApplyError('That game has already been scored.');

  return replaceSeason(league, season.id, s => {
    const base = item.newGame && !(s.games || []).some(g => g.id === item.newGame.id)
      ? [...(s.games || []), item.newGame]
      : (s.games || []);
    const updated = base.map(g => (g.id === item.gameId ? {
      ...g,
      homeScore: item.homeScore,
      awayScore: item.awayScore,
      innings: item.innings == null ? g.innings : item.innings,
      played: true,
      isForfeit: false,
      forfeitBy: null,
      isOngoing: false,
      isDelayed: false,
      notes: item.notes ? [g.notes, item.notes].filter(Boolean).join(' — ') : g.notes,
    } : g));
    const { games: afterPlayIn } = advancePlayIn(updated);
    const { games, championTeamId } = advancePlayoffs(afterPlayIn, s.settings || {}, seedById);
    return stripOddsCache({
      ...s,
      games,
      championTeamId: championTeamId !== undefined ? championTeamId : s.championTeamId,
    });
  });
}

function applyGameTime(league, item) {
  const season = activeSeasonOf(league);
  if (!(season.games || []).some(g => g.id === item.gameId)) {
    throw new ApplyError('That game is no longer on the schedule.');
  }
  return replaceSeason(league, season.id, s => ({
    ...s, games: (s.games || []).map(g => (g.id === item.gameId ? { ...g, gameTimeUTC: item.gameTimeUTC } : g)),
  }));
}

function applyTrade(league, item) {
  const season = activeSeasonOf(league);
  const sides = item.sides || [];
  if (sides.length < 2) throw new ApplyError('That trade does not have two sides.');
  sides.forEach(side => (side.playerIds || []).forEach(playerId => {
    const owner = ownerOf(season, playerId);
    if (!owner) throw new ApplyError('One of those players is no longer on a roster.');
    if (owner.teamId === side.teamId) throw new ApplyError('One of those players is already on the receiving team.');
  }));

  return replaceSeason(league, season.id, s => {
    const moves = [];
    sides.forEach(side => (side.playerIds || []).forEach(playerId => {
      const owner = ownerOf(s, playerId);
      const player = owner ? owner.roster.find(p => p.id === playerId) : null;
      if (player) moves.push({ player, toTeamId: side.teamId });
    }));
    const moving = new Set(moves.map(m => m.player.id));
    const members = (s.members || []).map(m => ({
      ...m,
      roster: [
        ...(m.roster || []).filter(p => !moving.has(p.id)),
        ...moves.filter(mv => mv.toTeamId === m.teamId).map(mv => mv.player),
      ],
    }));
    return { ...s, members, activityLog: appendActivity(s, { type: 'trade', teamId: sides[0].teamId, text: 'Trade applied from the bot queue' }) };
  });
}

function applySign(league, item) {
  const season = activeSeasonOf(league);
  if (item.playerId && ownerOf(season, item.playerId)) {
    throw new ApplyError('That player is already on a roster.');
  }
  return replaceSeason(league, season.id, s => {
    const existing = (s.freeAgents || []).find(p => p.id === item.playerId);
    const player = existing || {
      id: uid('p'),
      name: item.playerName,
      starLevel: item.starLevel === undefined ? null : item.starLevel,
      role: '',
    };
    return {
      ...s,
      freeAgents: (s.freeAgents || []).filter(p => p.id !== player.id),
      members: (s.members || []).map(m => (m.teamId === item.teamId
        ? { ...m, roster: [...(m.roster || []), player] }
        : m)),
      activityLog: appendActivity(s, { type: 'add', teamId: item.teamId, text: `${player.name} signed` }),
    };
  });
}

function applyRelease(league, item) {
  const season = activeSeasonOf(league);
  if (!ownerOf(season, item.playerId)) throw new ApplyError('That player is not on a roster.');
  return replaceSeason(league, season.id, s => {
    const owner = ownerOf(s, item.playerId);
    if (!owner) return s;
    const player = owner.roster.find(p => p.id === item.playerId);
    return {
      ...s,
      members: (s.members || []).map(m => (m.teamId === owner.teamId
        ? { ...m, roster: m.roster.filter(p => p.id !== item.playerId) }
        : m)),
      freeAgents: [...(s.freeAgents || []), player],
      activityLog: appendActivity(s, { type: 'remove', teamId: owner.teamId, text: `${player.name} released` }),
    };
  });
}

function applySuspension(league, item, kind) {
  const season = activeSeasonOf(league);
  if (!ownerOf(season, item.playerId)) throw new ApplyError('That player is not on a roster.');
  const suspended = kind === 'suspend';
  return replaceSeason(league, season.id, s => {
    const owner = ownerOf(s, item.playerId);
    if (!owner) return s;
    const played = (s.games || []).filter(g => g.played && !g.isBye
      && (g.homeTeamId === owner.teamId || g.awayTeamId === owner.teamId)).length;
    return {
      ...s,
      members: (s.members || []).map(m => (m.teamId === owner.teamId ? {
        ...m,
        roster: m.roster.map(p => (p.id === item.playerId ? {
          ...p,
          suspended,
          suspensionReason: suspended ? (item.reason || '') : '',
          suspensionGames: suspended ? (item.games || null) : null,
          suspensionStartGames: suspended ? played : null,
        } : p)),
      } : m)),
      activityLog: appendActivity(s, { type: suspended ? 'suspend' : 'unsuspend', teamId: owner.teamId, text: 'Discipline applied from the bot queue' }),
    };
  });
}

function applyBan(league, item, kind) {
  const season = activeSeasonOf(league);
  const banned = kind === 'ban';
  return replaceSeason(league, season.id, s => ({
    ...s,
    members: (s.members || []).map(m => ({
      ...m,
      roster: (m.roster || []).map(p => (p.id === item.playerId
        ? { ...p, banned, banReason: banned ? (item.reason || '') : '' }
        : p)),
    })),
    freeAgents: (s.freeAgents || []).map(p => (p.id === item.playerId
      ? { ...p, banned, banReason: banned ? (item.reason || '') : '' }
      : p)),
    activityLog: appendActivity(s, { type: banned ? 'ban' : 'unban', teamId: null, text: 'Discipline applied from the bot queue' }),
  }));
}

function applyAwards(league, item) {
  if (!(league.seasons || []).some(s => s.id === item.seasonId)) {
    throw new ApplyError('That season is no longer in the league.');
  }
  const known = league.awardDefs || [];
  const missing = (item.newAwardDefs || []).filter(d => !known.some(k => k.id === d.id));
  return replaceSeason(
    { ...league, awardDefs: [...known, ...missing] },
    item.seasonId,
    season => ({ ...season, awardWinners: item.awardWinners }),
  );
}

const APPLIERS = {
  final_score: (league, item, seedById) => applyFinalScore(league, item, seedById),
  game_time: (league, item) => applyGameTime(league, item),
  trade: (league, item) => applyTrade(league, item),
  sign: (league, item) => applySign(league, item),
  release: (league, item) => applyRelease(league, item),
  suspend: (league, item) => applySuspension(league, item, 'suspend'),
  unsuspend: (league, item) => applySuspension(league, item, 'unsuspend'),
  ban: (league, item) => applyBan(league, item, 'ban'),
  unban: (league, item) => applyBan(league, item, 'unban'),
  awards: (league, item) => applyAwards(league, item),
};

export function canApply(kind) {
  return Object.prototype.hasOwnProperty.call(APPLIERS, kind);
}

export function applyPendingItem(kind, item, seedById) {
  const applier = APPLIERS[kind];
  return (league) => {
    if (!applier) throw new ApplyError(`The site does not know how to apply "${kind}".`);
    if (!item) throw new ApplyError('That review item has nothing to apply.');
    if (!activeSeasonOf(league)) throw new ApplyError('No season is loaded.');
    return applier(league, item, seedById);
  };
}
