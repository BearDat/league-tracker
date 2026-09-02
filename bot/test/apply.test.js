import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFinalScore, applyTrade, applySign, applyRelease, applySuspension, applyBan, applyGameTime,
} from '../src/apply/index.js';

const NAMES = { A: 'Anaheim Stars', B: 'Los Angeles Reapers', C: 'Toronto Tigers' };
const nameFor = (id) => NAMES[id] || 'Unknown team';

function player(id, name, starLevel) {
  return { id, name, starLevel: starLevel === undefined ? null : starLevel, role: '' };
}

function baseLeague(overrides = {}) {
  const season = {
    id: 's1',
    name: 'Season 1',
    settings: { seriesLength: 3, playoffSpots: 4, standardInnings: 7 },
    members: [
      { teamId: 'A', roster: [player('p1', 'berniezanoob', 3), player('p2', 'Nxnjahh', 2)] },
      { teamId: 'B', roster: [player('p3', 'Novatic_Legend', 3), player('p4', 'doogypirate', 1.5)] },
      { teamId: 'C', roster: [player('p5', 'dumnist', null)] },
    ],
    freeAgents: [player('p6', 'viperman110', null)],
    games: [],
    activityLog: [],
    oddsCache: { sim: {}, computedAt: 1 },
    ...overrides,
  };
  return { activeSeasonId: 's1', seasons: [season], auditLog: [] };
}

function playoffGame(seriesGame, extra = {}) {
  return {
    id: `g${seriesGame}`,
    date: 'Playoffs R1',
    isPlayoff: true,
    playoffRound: 1,
    bracketSlot: 0,
    seriesGame,
    higherSeedId: 'A',
    homeTeamId: 'A',
    awayTeamId: 'B',
    homeScore: null,
    awayScore: null,
    innings: null,
    played: false,
    ...extra,
  };
}

const seasonOf = (league) => league.seasons[0];

test('final score marks the game played and records the score', () => {
  const league = baseLeague({ games: [playoffGame(1)] });
  const { league: next, summary } = applyFinalScore(league, { gameId: 'g1', homeScore: 5, awayScore: 3, innings: 9, notes: null }, nameFor);
  const game = seasonOf(next).games.find(g => g.id === 'g1');
  assert.equal(game.played, true);
  assert.equal(game.homeScore, 5);
  assert.equal(game.awayScore, 3);
  assert.equal(game.innings, 9);
  assert.equal(game.isForfeit, false);
  assert.match(summary, /Los Angeles Reapers 3 @ Anaheim Stars 5/);
});

test('final score generates the next game of an undecided series', () => {
  const league = baseLeague({ games: [playoffGame(1)] });
  const { league: next } = applyFinalScore(league, { gameId: 'g1', homeScore: 5, awayScore: 3, innings: 9, notes: null }, nameFor);
  const games = seasonOf(next).games.filter(g => g.isPlayoff);
  assert.equal(games.length, 2);
  const g2 = games.find(g => g.seriesGame === 2);
  assert.ok(g2, 'game 2 was created');
  assert.equal(g2.homeTeamId, 'B');
  assert.equal(g2.awayTeamId, 'A');
  assert.equal(g2.higherSeedId, 'A');
  assert.equal(g2.played, false);
});

test('winning the final series sets the champion', () => {
  const league = baseLeague({
    games: [
      playoffGame(1, { played: true, homeScore: 5, awayScore: 3 }),
      playoffGame(2, { homeTeamId: 'B', awayTeamId: 'A' }),
    ],
  });
  const { league: next } = applyFinalScore(league, { gameId: 'g2', homeScore: 1, awayScore: 4, innings: 9, notes: null }, nameFor);
  assert.equal(seasonOf(next).championTeamId, 'A');
});

test('final score drops the stale odds cache so the site recomputes it', () => {
  const league = baseLeague({ games: [playoffGame(1)] });
  assert.ok(seasonOf(league).oddsCache);
  const { league: next } = applyFinalScore(league, { gameId: 'g1', homeScore: 5, awayScore: 3, innings: 9, notes: null }, nameFor);
  assert.equal(seasonOf(next).oddsCache, undefined);
});

test('final score appends an audit entry', () => {
  const league = baseLeague({ games: [playoffGame(1)] });
  const { league: next } = applyFinalScore(league, { gameId: 'g1', homeScore: 5, awayScore: 3, innings: 9, notes: null }, nameFor);
  assert.equal(next.auditLog.length, 1);
  assert.equal(next.auditLog[0].action, 'Score recorded by bot');
});

test('game time is written without touching the score', () => {
  const league = baseLeague({ games: [playoffGame(1)] });
  const { league: next } = applyGameTime(league, { gameId: 'g1', gameTimeUTC: 1730000000000 }, nameFor);
  const game = seasonOf(next).games.find(g => g.id === 'g1');
  assert.equal(game.gameTimeUTC, 1730000000000);
  assert.equal(game.played, false);
});

test('trade moves players in both directions', () => {
  const league = baseLeague();
  const item = {
    sides: [
      { teamId: 'A', playerIds: ['p3'] },
      { teamId: 'B', playerIds: ['p1'] },
    ],
  };
  const { league: next, summary } = applyTrade(league, item, nameFor);
  const season = seasonOf(next);
  const teamA = season.members.find(m => m.teamId === 'A');
  const teamB = season.members.find(m => m.teamId === 'B');
  assert.deepEqual(teamA.roster.map(p => p.id).sort(), ['p2', 'p3']);
  assert.deepEqual(teamB.roster.map(p => p.id).sort(), ['p1', 'p4']);
  assert.match(summary, /Anaheim Stars receive Novatic_Legend/);
  assert.equal(season.activityLog.at(-1).type, 'trade');
});

test('release moves the player into free agency', () => {
  const league = baseLeague();
  const { league: next, summary } = applyRelease(league, { teamId: 'C', playerId: 'p5' }, nameFor);
  const season = seasonOf(next);
  assert.equal(season.members.find(m => m.teamId === 'C').roster.length, 0);
  assert.ok(season.freeAgents.some(p => p.id === 'p5'));
  assert.match(summary, /dumnist released by Toronto Tigers/);
  assert.equal(season.activityLog.at(-1).type, 'remove');
});

test('signing pulls an existing free agent onto the roster', () => {
  const league = baseLeague();
  const { league: next } = applySign(league, { teamId: 'C', playerId: 'p6', playerName: 'viperman110', starLevel: null }, nameFor);
  const season = seasonOf(next);
  assert.equal(season.freeAgents.length, 0);
  assert.ok(season.members.find(m => m.teamId === 'C').roster.some(p => p.id === 'p6'));
  assert.equal(season.activityLog.at(-1).type, 'add');
});

test('signing an unknown name creates a new player', () => {
  const league = baseLeague();
  const { league: next } = applySign(league, { teamId: 'C', playerId: null, playerName: 'brandnewguy', starLevel: 2.5 }, nameFor);
  const roster = seasonOf(next).members.find(m => m.teamId === 'C').roster;
  const added = roster.find(p => p.name === 'brandnewguy');
  assert.ok(added);
  assert.equal(added.starLevel, 2.5);
  assert.match(added.id, /^p_/);
});

test('suspension records reason, length, and games served baseline', () => {
  const league = baseLeague({
    games: [
      { id: 'r1', homeTeamId: 'A', awayTeamId: 'C', played: true, homeScore: 3, awayScore: 1 },
      { id: 'r2', homeTeamId: 'A', awayTeamId: 'B', played: false },
    ],
  });
  const { league: next, summary } = applySuspension(league, { playerId: 'p2', games: 2, reason: 'Ejection', suspended: true }, nameFor);
  const p = seasonOf(next).members.find(m => m.teamId === 'A').roster.find(x => x.id === 'p2');
  assert.equal(p.suspended, true);
  assert.equal(p.suspensionGames, 2);
  assert.equal(p.suspensionReason, 'Ejection');
  assert.equal(p.suspensionStartGames, 1);
  assert.match(summary, /Nxnjahh \(Anaheim Stars\) suspended for 2 games — Ejection/);
  assert.equal(seasonOf(next).activityLog.at(-1).type, 'suspend');
});

test('ban flags the player and logs it', () => {
  const league = baseLeague();
  const { league: next, summary } = applyBan(league, { playerId: 'p1', reason: 'Racism', banned: true }, nameFor);
  const p = seasonOf(next).members.find(m => m.teamId === 'A').roster.find(x => x.id === 'p1');
  assert.equal(p.banned, true);
  assert.equal(p.banReason, 'Racism');
  assert.match(summary, /banned — Racism/);
  assert.equal(seasonOf(next).activityLog.at(-1).type, 'ban');
});

test('appliers never mutate the league they were given', () => {
  const league = baseLeague({ games: [playoffGame(1)] });
  const snapshot = JSON.stringify(league);
  applyFinalScore(league, { gameId: 'g1', homeScore: 5, awayScore: 3, innings: 9, notes: null }, nameFor);
  applyTrade(league, { sides: [{ teamId: 'A', playerIds: ['p3'] }, { teamId: 'B', playerIds: ['p1'] }] }, nameFor);
  applyBan(league, { playerId: 'p1', reason: 'x', banned: true }, nameFor);
  assert.equal(JSON.stringify(league), snapshot);
});
