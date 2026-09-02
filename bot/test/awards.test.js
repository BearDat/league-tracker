import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAwards } from '../src/parsers/awards.js';
import { resolveParsed } from '../src/resolve/index.js';
import { applyAwards } from '../src/apply/index.js';

const SAMPLE = readFileSync(new URL('../samples/awards.txt', import.meta.url), 'utf8');

const MIA = '<:MiamiSharks:1351292128948650036>';
const BRO = '<:BrooklynBears:1351292109474365575>';
const KPB = '<:KPB:1351045785260654602>';

const DIRECTORY = [
  { teamId: 'MIA', name: 'Miami Sharks', normalized: 'miamisharks', nickname: 'sharks' },
  { teamId: 'BRO', name: 'Brooklyn Bears', normalized: 'brooklynbears', nickname: 'bears' },
];

function league() {
  return {
    activeSeasonId: 's5',
    awardDefs: [
      { id: 'a_mvp', name: 'MVP', description: '' },
      { id: 'a_ss', name: 'Silver Slugger', description: '' },
    ],
    seasons: [
      { id: 's5', name: 'Season 5', members: [], freeAgents: [], awardWinners: {} },
      {
        id: 's4',
        name: 'Season 4',
        members: [
          { teamId: 'MIA', roster: [{ id: 'p1', name: 'aceelordd' }, { id: 'p2', name: 'El_capitan283' }] },
          { teamId: 'BRO', roster: [{ id: 'p3', name: 'kobbiemainoolover486' }] },
        ],
        freeAgents: [],
        awardWinners: { a_mvp: [{ type: 'player', playerId: 'p9', teamId: 'BRO' }] },
      },
    ],
    auditLog: [],
  };
}

function context(lg) {
  return {
    league: lg,
    season: lg.seasons[0],
    directory: [],
    aliases: new Map(),
    learn: false,
    nameFor: (id) => id,
    directoryForSeason: async () => DIRECTORY,
  };
}

test('awards: both season blocks in one message parse independently', () => {
  const rows = parseAwards(SAMPLE);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].seasonNumber, 4);
  assert.equal(rows[1].seasonNumber, 3);
  rows.forEach(r => assert.equal(r.ok, true));
});

test('awards: a bare "Name:" heading collects the emoji lines under it', () => {
  const [s4] = parseAwards(SAMPLE);
  const ss = s4.awards.find(a => a.name === 'Silver Sluggers');
  assert.equal(ss.winners.length, 8);
  assert.equal(ss.winners[0].player, 'aceelordd');
  assert.equal(ss.winners[0].emojiName, 'MiamiSharks');
});

test('awards: a heading that collects nothing is a divider, not an award', () => {
  const [s4] = parseAwards(SAMPLE);
  assert.equal(s4.awards.some(a => a.name === 'Miscellaneous Awards'), false);
  assert.equal(s4.awards.some(a => a.name === 'Broken Glove'), true);
});

test('awards: "-" and ":" both separate a label from its winner', () => {
  const [, s3] = parseAwards(SAMPLE);
  assert.equal(s3.awards.find(a => a.name === 'MOTY').winners[0].player, 'I_carius');
  assert.equal(s3.awards.find(a => a.name === 'Batting Title').winners[0].player, 'Ajisabeastlol');
  assert.equal(s3.awards.find(a => a.name === 'Cy Young').winners[0].player, 'FastKJammer');
});

test('awards: a winner glued to its emoji still separates', () => {
  const [r] = parseAwards(`${KPB} SEASON 4 AWARDS\nROTY: ${BRO}pickles_here13`);
  assert.equal(r.awards[0].winners[0].player, 'pickles_here13');
});

test('awards: text with no season heading is not awards at all', () => {
  assert.deepEqual(parseAwards(`${MIA} 4 - 2 ${BRO} F/7`), []);
});

test('awards: winners resolve against the named season, not the active one', async () => {
  const [parsed] = parseAwards(`${KPB} SEASON 4 AWARDS ${KPB}\nMVP: ${MIA} aceelordd`);
  const resolved = await resolveParsed(parsed, context(league()));
  assert.equal(resolved.confidence, 'high');
  assert.equal(resolved.item.seasonId, 's4');
  assert.deepEqual(resolved.item.awardWinners.a_mvp, [{ type: 'player', playerId: 'p1', teamId: 'MIA' }]);
});

test('awards: a plural heading matches the singular award already defined', async () => {
  const [parsed] = parseAwards(`SEASON 4 AWARDS\nSilver Sluggers:\n${MIA} aceelordd\n${BRO} kobbiemainoolover486`);
  const resolved = await resolveParsed(parsed, context(league()));
  assert.equal(resolved.item.newAwardDefs.length, 0);
  assert.equal(resolved.item.awardWinners.a_ss.length, 2);
});

test('awards: an unknown award is created and reported', async () => {
  const [parsed] = parseAwards(`SEASON 4 AWARDS\nBroken Glove: ${MIA} El_capitan283`);
  const resolved = await resolveParsed(parsed, context(league()));
  assert.equal(resolved.confidence, 'high');
  assert.equal(resolved.item.newAwardDefs.length, 1);
  assert.equal(resolved.item.newAwardDefs[0].name, 'Broken Glove');
  assert.match(resolved.item.notes.join('\n'), /created awards: Broken Glove/);
});

test('awards: a winner off the roster is saved by name with the emoji team', async () => {
  const [parsed] = parseAwards(`SEASON 4 AWARDS\nMVP: ${MIA} someone_new`);
  const resolved = await resolveParsed(parsed, context(league()));
  assert.deepEqual(resolved.item.awardWinners.a_mvp, [
    { type: 'player', playerId: null, name: 'someone_new', teamId: 'MIA' },
  ]);
  assert.match(resolved.item.notes.join('\n'), /saved by name: someone_new/);
});

test('awards: the roster wins when the emoji names a different team', async () => {
  const [parsed] = parseAwards(`SEASON 4 AWARDS\nMVP: ${BRO} aceelordd`);
  const resolved = await resolveParsed(parsed, context(league()));
  assert.equal(resolved.item.awardWinners.a_mvp[0].teamId, 'MIA');
  assert.match(resolved.item.notes.join('\n'), /emoji\/roster disagree: aceelordd/);
});

test('awards: a season the league does not have is held, not guessed at', async () => {
  const [parsed] = parseAwards(`SEASON 9 AWARDS\nMVP: ${MIA} aceelordd`);
  const resolved = await resolveParsed(parsed, context(league()));
  assert.equal(resolved.confidence, 'low');
  assert.equal(resolved.item, null);
  assert.match(resolved.reasons[0], /no season .* "Season 9"/);
});

test('awards: applying replaces that season only and leaves the rest alone', async () => {
  const lg = league();
  const [parsed] = parseAwards(`SEASON 4 AWARDS\nBroken Glove: ${MIA} El_capitan283`);
  const resolved = await resolveParsed(parsed, context(lg));
  const { league: next, summary } = applyAwards(lg, resolved.item);

  const s4 = next.seasons.find(s => s.id === 's4');
  assert.deepEqual(Object.keys(s4.awardWinners), [resolved.item.newAwardDefs[0].id]);
  assert.equal(next.seasons.find(s => s.id === 's5').awardWinners, lg.seasons[0].awardWinners);
  assert.equal(next.awardDefs.length, 3);
  assert.equal(lg.seasons.find(s => s.id === 's4').awardWinners.a_mvp.length, 1);
  assert.match(summary, /Season 4 awards — 1 award, 1 winner \(replaced 1 award, 1 winner\)/);
  assert.match(summary, /Broken Glove: El_capitan283/);
});
