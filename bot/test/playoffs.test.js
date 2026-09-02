import test from 'node:test';
import assert from 'node:assert/strict';
import { planPlayoffContinuation, findScheduledGame } from '../src/resolve/games.js';
import { applyFinalScore } from '../src/apply/index.js';
import { parseFinalScoreLine } from '../src/parsers/finalScores.js';

const nameFor = (id) => ({ A: 'Arizona Firebirds', B: 'Chicago Breeze' }[id] || id);

function playoffGame(n, extra = {}) {
  return {
    id: `g${n}`,
    date: 'Playoffs R2',
    isPlayoff: true,
    playoffRound: 2,
    bracketSlot: 0,
    seriesGame: n,
    higherSeedId: 'A',
    homeTeamId: n % 2 === 1 ? 'A' : 'B',
    awayTeamId: n % 2 === 1 ? 'B' : 'A',
    played: false,
    homeScore: null,
    awayScore: null,
    innings: null,
    ...extra,
  };
}

function season(games, seriesLength = 5) {
  return {
    id: 's1',
    settings: { seriesLength, standardInnings: 7 },
    members: [
      { teamId: 'A', roster: [] },
      { teamId: 'B', roster: [] },
    ],
    freeAgents: [],
    games,
    activityLog: [],
  };
}

test('a finished series game with no next game scheduled is refused today', () => {
  const s = season([
    playoffGame(1, { played: true, homeScore: 5, awayScore: 2 }),
    playoffGame(2, { played: true, homeScore: 4, awayScore: 1 }),
    playoffGame(3, { played: true, homeScore: 3, awayScore: 6 }),
  ]);
  const found = findScheduledGame(s, 'A', 'B');
  assert.equal(found.game, null);
  assert.match(found.reason, /already marked played/);
});

test('the next game of an undecided series is planned instead', () => {
  const s = season([
    playoffGame(1, { played: true, homeScore: 5, awayScore: 2 }),
    playoffGame(2, { played: true, homeScore: 4, awayScore: 1 }),
    playoffGame(3, { played: true, homeScore: 3, awayScore: 6 }),
  ]);
  const plan = planPlayoffContinuation(s, 'A', 'B');
  assert.ok(plan && plan.game, 'a continuation was planned');
  assert.equal(plan.nextGameNum, 4);
  assert.equal(plan.seriesLength, 5);
  assert.equal(plan.game.playoffRound, 2);
  assert.equal(plan.game.bracketSlot, 0);
  assert.equal(plan.game.higherSeedId, 'A');
  assert.equal(plan.game.homeTeamId, 'B');
  assert.equal(plan.game.awayTeamId, 'A');
  assert.equal(plan.game.played, false);
});

test('a decided series is blocked, not extended', () => {
  const s = season([
    playoffGame(1, { played: true, homeScore: 5, awayScore: 2 }),
    playoffGame(2, { played: true, homeScore: 1, awayScore: 7 }),
    playoffGame(3, { played: true, homeScore: 6, awayScore: 0 }),
  ], 3);
  const plan = planPlayoffContinuation(s, 'A', 'B');
  assert.ok(plan);
  assert.equal(plan.game, undefined);
  assert.match(plan.blocked, /already decided/);
});

test('no playoff history between the teams plans nothing', () => {
  const s = season([]);
  assert.equal(planPlayoffContinuation(s, 'A', 'B'), null);
});

test('an existing unplayed game is used rather than planning a new one', () => {
  const s = season([
    playoffGame(1, { played: true, homeScore: 5, awayScore: 2 }),
    playoffGame(2),
  ]);
  const found = findScheduledGame(s, 'A', 'B');
  assert.equal(found.game.id, 'g2');
  assert.equal(planPlayoffContinuation(s, 'A', 'B'), null);
});

test('applying a score creates the planned game and advances the series', () => {
  const s = season([
    playoffGame(1, { played: true, homeScore: 5, awayScore: 2 }),
    playoffGame(2, { played: true, homeScore: 4, awayScore: 1 }),
    playoffGame(3, { played: true, homeScore: 3, awayScore: 6 }),
  ]);
  const plan = planPlayoffContinuation(s, 'A', 'B');
  const league = { activeSeasonId: 's1', seasons: [s], auditLog: [] };

  const { league: next, summary } = applyFinalScore(
    league,
    { gameId: plan.game.id, homeScore: 6, awayScore: 5, innings: 9, notes: 'clincher', newGame: plan.game },
    nameFor,
  );

  const games = next.seasons[0].games;
  const created = games.find(g => g.id === plan.game.id);
  assert.ok(created, 'the planned game was added');
  assert.equal(created.played, true);
  assert.equal(created.homeScore, 6);
  assert.equal(created.awayScore, 5);
  assert.equal(created.innings, 9);
  assert.match(summary, /Arizona Firebirds 5 @ Chicago Breeze 6/);

  const seriesGames = games.filter(g => g.isPlayoff && g.playoffRound === 2 && g.bracketSlot === 0);
  assert.equal(seriesGames.length, 4, 'the series ended 3-1, so no game 5 was generated');
  assert.equal(next.seasons[0].championTeamId, 'B', 'the series winner advances');
});

test('a non-clinching score generates the following game instead', () => {
  const s = season([
    playoffGame(1, { played: true, homeScore: 5, awayScore: 2 }),
    playoffGame(2, { played: true, homeScore: 4, awayScore: 1 }),
    playoffGame(3, { played: true, homeScore: 3, awayScore: 6 }),
  ]);
  const plan = planPlayoffContinuation(s, 'A', 'B');
  assert.equal(plan.nextGameNum, 4);
  const league = { activeSeasonId: 's1', seasons: [s], auditLog: [] };

  const { league: next } = applyFinalScore(
    league,
    { gameId: plan.game.id, homeScore: 5, awayScore: 6, innings: 9, notes: null, newGame: plan.game },
    nameFor,
  );

  const seriesGames = next.seasons[0].games.filter(g => g.isPlayoff && g.playoffRound === 2 && g.bracketSlot === 0);
  assert.equal(seriesGames.length, 5, 'the series is level 2-2, so game 5 exists');
  const g5 = seriesGames.find(g => g.seriesGame === 5);
  assert.ok(g5);
  assert.equal(g5.played, false);
});

test('the real line that failed parses and keeps the advance note', () => {
  const line = '<:ArizonaFirebirds:1351292101622763530> 5 - 6<:ChicagoBreeze:1454275029864026224> F/9 (LEFIHTHEGOAT GO AHEAD 2 RBI DOUBLE ALSO SAVE!) Breeze Advance to the WS!)';
  const r = parseFinalScoreLine(line);
  assert.equal(r.ok, true);
  assert.equal(r.left.score, 5);
  assert.equal(r.right.score, 6);
  assert.equal(r.innings, 9);
  assert.deepEqual(r.notes, ['LEFIHTHEGOAT GO AHEAD 2 RBI DOUBLE ALSO SAVE!']);
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].type, 'advance');
  assert.match(r.series[0].label, /Advance to the WS/);
});

test('text after an unmatched paren is still read', () => {
  const line = '<:A:1> 2 - 3 <:B:2> F/9 (nice game) Series tied 2-2)';
  const r = parseFinalScoreLine(line);
  assert.equal(r.ok, true);
  assert.deepEqual(r.notes, ['nice game']);
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].type, 'tied');
  assert.equal(r.series[0].wins, 2);
});
