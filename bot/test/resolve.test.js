import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveParsed } from '../src/resolve/index.js';
import { parseFinalScoreLine } from '../src/parsers/finalScores.js';

const ARI_EMOJI = '<:ArizonaFirebirds:1351292101622763530>';
const CHI_EMOJI = '<:ChicagoBreeze:1454275029864026224>';

const DIRECTORY = [
  { teamId: 'ARI', name: 'Arizona Firebirds', normalized: 'arizonafirebirds', nickname: 'firebirds' },
  { teamId: 'CHI', name: 'Chicago Breeze', normalized: 'chicagobreeze', nickname: 'breeze' },
];

function playoffGame(n, extra = {}) {
  return {
    id: `g${n}`,
    date: 'Playoffs R2',
    isPlayoff: true,
    playoffRound: 2,
    bracketSlot: 0,
    seriesGame: n,
    higherSeedId: 'ARI',
    homeTeamId: n % 2 === 1 ? 'ARI' : 'CHI',
    awayTeamId: n % 2 === 1 ? 'CHI' : 'ARI',
    played: false,
    homeScore: null,
    awayScore: null,
    innings: null,
    ...extra,
  };
}

function context(games) {
  const season = {
    id: 's1',
    settings: { seriesLength: 5, standardInnings: 7 },
    members: [{ teamId: 'ARI', roster: [] }, { teamId: 'CHI', roster: [] }],
    freeAgents: [],
    games,
    activityLog: [],
  };
  const names = { ARI: 'Arizona Firebirds', CHI: 'Chicago Breeze' };
  return {
    season,
    directory: DIRECTORY,
    aliases: new Map(),
    learn: false,
    nameFor: (id) => names[id] || id,
  };
}

test('a normal final score resolves against an existing scheduled game', async () => {
  const ctx = context([playoffGame(1)]);
  const parsed = parseFinalScoreLine(`${ARI_EMOJI} 12 - 9 ${CHI_EMOJI} F/10`);
  const resolved = await resolveParsed(parsed, ctx);
  assert.equal(resolved.kind, 'final_score');
  assert.equal(resolved.confidence, 'high');
  assert.deepEqual(resolved.reasons, []);
  assert.equal(resolved.item.gameId, 'g1');
  assert.equal(resolved.item.homeScore, 12);
  assert.equal(resolved.item.awayScore, 9);
  assert.equal(resolved.item.innings, 10);
  assert.equal(resolved.item.newGame, null);
});

test('a series-clinching score with no scheduled game plans the next game', async () => {
  const ctx = context([
    playoffGame(1, { played: true, homeScore: 12, awayScore: 9 }),
    playoffGame(2, { played: true, homeScore: 8, awayScore: 1 }),
    playoffGame(3, { played: true, homeScore: 12, awayScore: 1 }),
    playoffGame(4, { played: true, homeScore: 9, awayScore: 8 }),
  ]);
  const parsed = parseFinalScoreLine(
    `${ARI_EMOJI} 5 - 6${CHI_EMOJI} F/9 (LEFIHTHEGOAT GO AHEAD 2 RBI DOUBLE ALSO SAVE!) ${CHI_EMOJI}  Advance to the WS!)`,
  );
  const resolved = await resolveParsed(parsed, ctx);
  assert.equal(resolved.kind, 'final_score');
  assert.ok(resolved.item, 'an item was produced');
  assert.ok(resolved.item.newGame, 'game 5 was planned');
  assert.equal(resolved.item.newGame.seriesGame, 5);
  assert.equal(resolved.item.gameId, resolved.item.newGame.id);
  assert.equal(resolved.confidence, 'high');
  assert.match(resolved.display.created, /Game 5 of a best-of-5/);
});

test('a decided series is refused rather than extended', async () => {
  const ctx = context([
    playoffGame(1, { played: true, homeScore: 12, awayScore: 9 }),
    playoffGame(2, { played: true, homeScore: 1, awayScore: 8 }),
    playoffGame(3, { played: true, homeScore: 12, awayScore: 1 }),
    playoffGame(4, { played: true, homeScore: 1, awayScore: 9 }),
    playoffGame(5, { played: true, homeScore: 7, awayScore: 2 }),
  ]);
  const parsed = parseFinalScoreLine(`${ARI_EMOJI} 5 - 6 ${CHI_EMOJI} F/9`);
  const resolved = await resolveParsed(parsed, ctx);
  assert.equal(resolved.confidence, 'low');
  assert.ok(resolved.reasons.some(r => /already decided|all 5 games/.test(r)), resolved.reasons.join('; '));
});

test('an FFT line is held for review rather than written', async () => {
  const ctx = context([playoffGame(1)]);
  const parsed = parseFinalScoreLine(`${CHI_EMOJI} 1 - 12 ${ARI_EMOJI} FFT/5`);
  const resolved = await resolveParsed(parsed, ctx);
  assert.equal(resolved.confidence, 'low');
  assert.ok(resolved.reasons.some(r => /FFT/.test(r)), resolved.reasons.join('; '));
  assert.ok(resolved.item, 'the parse is still usable if approved');
});

test('a series note that disagrees with the schedule is flagged', async () => {
  const ctx = context([
    playoffGame(1, { played: true, homeScore: 12, awayScore: 9 }),
    playoffGame(2),
  ]);
  const parsed = parseFinalScoreLine(`${ARI_EMOJI} 3 - 4 ${CHI_EMOJI} F/9 (${CHI_EMOJI} leads series 2-0)`);
  const resolved = await resolveParsed(parsed, ctx);
  assert.equal(resolved.confidence, 'low');
  assert.ok(resolved.reasons.some(r => /series note says/.test(r)), resolved.reasons.join('; '));
});

test('a prose line with a score but no final marker is skipped', async () => {
  const ctx = context([playoffGame(1)]);
  const parsed = parseFinalScoreLine(`${ARI_EMOJI} 9 - 8 ${CHI_EMOJI} in the top of the 7th inning`);
  const resolved = await resolveParsed(parsed, ctx);
  assert.equal(resolved.kind, 'skip');
  assert.equal(resolved.item, null);
});

test('an unmapped emoji is queued with team candidates to choose from', async () => {
  const ctx = context([playoffGame(1)]);
  const parsed = parseFinalScoreLine(`<:MysteryClub:999> 3 - 4 ${CHI_EMOJI} F/9`);
  const resolved = await resolveParsed(parsed, ctx);
  assert.equal(resolved.confidence, 'low');
  assert.ok(resolved.item.unresolvedEmoji.length === 1);
  assert.equal(resolved.item.unresolvedEmoji[0].emojiName, 'MysteryClub');
  assert.ok(resolved.item.unresolvedEmoji[0].candidates.length > 0);
});
