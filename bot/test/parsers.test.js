import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFinalScores } from '../src/parsers/finalScores.js';
import { parseTransactions } from '../src/parsers/transactions.js';
import { parseSuspensions } from '../src/parsers/suspensions.js';
import { parseGameTimes } from '../src/parsers/gameTimes.js';

const ANA = '<:AnaheimStars:1392937345145114624>';
const LAR = '<:LosAngelesReapers:1419206642007932961>';
const TOR = '<:TorontoTigers:1351292154856603668>';
const TOR2 = '<:TorontoTigers:1351417278264115281>';
const IPU = '<:ArchersIPU:1334963705548509206>';
const STL = '<:StLouisArchers:1305688873879339160>';
const ARI = '<:ArizonaFirebirds:1351292101622763530>';
const CHI = '<:ChicagoBreeze:1514100459902603390>';

test('final score: shutout with performance note and advance note', () => {
  const line = `${ANA} 0 - 4 ${LAR} F/9 (berniezanoob CGSO + puppeted a bit but still CGSO cuz its bzn and he has aura) (${LAR} advance to the World Series)`;
  const [r] = parseFinalScores(line);
  assert.equal(r.ok, true);
  assert.equal(r.left.emojiId, '1392937345145114624');
  assert.equal(r.left.score, 0);
  assert.equal(r.right.emojiId, '1419206642007932961');
  assert.equal(r.right.score, 4);
  assert.equal(r.innings, 9);
  assert.equal(r.isFinal, true);
  assert.equal(r.notes.length, 1);
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].type, 'advance');
  assert.equal(r.series[0].emojiId, '1419206642007932961');
});

test('final score: series lead note is parsed, not mistaken for the score', () => {
  const line = `${ANA} 8 - 16 ${LAR} F/9 (berniezanoob 2 HR game, kobbiemainoolover486 2 HR game, ${LAR} leads series 2-1)`;
  const [r] = parseFinalScores(line);
  assert.equal(r.ok, true);
  assert.equal(r.left.score, 8);
  assert.equal(r.right.score, 16);
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].type, 'leads');
  assert.equal(r.series[0].wins, 2);
  assert.equal(r.series[0].losses, 1);
  assert.equal(r.series[0].emojiId, '1419206642007932961');
});

test('final score: no space between emoji and score', () => {
  const line = `${TOR}9 - 3 ${IPU} F/9`;
  const [r] = parseFinalScores(line);
  assert.equal(r.ok, true);
  assert.equal(r.left.emojiId, '1351292154856603668');
  assert.equal(r.left.score, 9);
  assert.equal(r.right.emojiId, '1334963705548509206');
  assert.equal(r.right.score, 3);
  assert.equal(r.innings, 9);
  assert.equal(r.notes.length, 0);
  assert.equal(r.series.length, 0);
});

test('final score: multiple lines in one message', () => {
  const content = `${TOR}9 - 3 ${IPU} F/9\n${ANA} 0 - 4 ${LAR} F/9`;
  const rows = parseFinalScores(content);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.ok));
});

test('final score: extra innings recorded', () => {
  const [r] = parseFinalScores(`${ANA} 5 - 6 ${LAR} F/12`);
  assert.equal(r.innings, 12);
});

test('transaction: multi-line trade with two sides', () => {
  const content = `- Trade: ${LAR} receive: Novatic_Legend (3 ⭐) (42/45)\n${STL} receive: doogypirate, Swaggyboygrind (3 ⭐) (38.5/45)`;
  const rows = parseTransactions(content);
  assert.equal(rows.length, 1);
  const t = rows[0];
  assert.equal(t.ok, true);
  assert.equal(t.kind, 'trade');
  assert.equal(t.sides.length, 2);
  assert.deepEqual(t.sides[0].players, ['Novatic_Legend']);
  assert.equal(t.sides[0].starsReceived, 3);
  assert.deepEqual(t.sides[0].capAfter, { used: 42, max: 45 });
  assert.deepEqual(t.sides[1].players, ['doogypirate', 'Swaggyboygrind']);
  assert.equal(t.sides[1].starsReceived, 3);
  assert.deepEqual(t.sides[1].capAfter, { used: 38.5, max: 45 });
});

test('transaction: release with rookie rating', () => {
  const rows = parseTransactions(`- Release: ${TOR2} release: dumnist (R)`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ok, true);
  assert.equal(rows[0].kind, 'release');
  assert.deepEqual(rows[0].players, ['dumnist']);
  assert.equal(rows[0].starLevel, null);
  assert.equal(rows[0].rookie, true);
  assert.equal(rows[0].emojiId, '1351417278264115281');
});

test('transaction: signing', () => {
  const rows = parseTransactions(`- Sign: ${CHI} sign: viperman110 (R)`);
  assert.equal(rows[0].ok, true);
  assert.equal(rows[0].kind, 'sign');
  assert.deepEqual(rows[0].players, ['viperman110']);
  assert.equal(rows[0].rookie, true);
});

test('transaction: several entries in one message', () => {
  const content = [
    `- Trade: ${LAR} receive: Novatic_Legend (3 ⭐) (42/45)`,
    `${STL} receive: doogypirate, Swaggyboygrind (3 ⭐) (38.5/45)`,
    `- Release: ${TOR2} release: dumnist (R)`,
    `- Sign: ${CHI} sign: viperman110 (R)`,
  ].join('\n');
  const rows = parseTransactions(content);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.kind), ['trade', 'release', 'sign']);
});

test('transaction: star level with a decimal', () => {
  const rows = parseTransactions(`- Sign: ${CHI} sign: someguy (4.5 ⭐)`);
  assert.equal(rows[0].starLevel, 4.5);
  assert.equal(rows[0].rookie, false);
});

test('suspension: game count and reason', () => {
  const rows = parseSuspensions(`${ARI} Nxnjahh suspended 2 games. (Ejection)`);
  assert.equal(rows[0].ok, true);
  assert.equal(rows[0].kind, 'suspend');
  assert.equal(rows[0].player, 'Nxnjahh');
  assert.equal(rows[0].games, 2);
  assert.equal(rows[0].reason, 'Ejection');
  assert.equal(rows[0].emojiId, '1351292101622763530');
});

test('suspension: ban from the league', () => {
  const rows = parseSuspensions(`${ANA} mrderek124679 banned from KPB. (Racism)`);
  assert.equal(rows[0].ok, true);
  assert.equal(rows[0].kind, 'ban');
  assert.equal(rows[0].player, 'mrderek124679');
  assert.equal(rows[0].reason, 'Racism');
});

test('suspension: indefinite', () => {
  const rows = parseSuspensions(`${ARI} someone suspended indefinitely. (Cheating)`);
  assert.equal(rows[0].kind, 'suspend');
  assert.equal(rows[0].indefinite, true);
  assert.equal(rows[0].games, null);
});

test('suspension: lifted', () => {
  const rows = parseSuspensions(`${ARI} Nxnjahh suspension lifted.`);
  assert.equal(rows[0].kind, 'unsuspend');
  assert.equal(rows[0].player, 'Nxnjahh');
});

test('game time: discord timestamp is exact', () => {
  const rows = parseGameTimes(`${ANA} @ ${LAR} <t:1730000000:F>`);
  assert.equal(rows[0].ok, true);
  assert.equal(rows[0].exact, true);
  assert.equal(rows[0].gameTimeUTC, 1730000000000);
  assert.equal(rows[0].separator, '@');
});

test('game time: eastern clock time with explicit date', () => {
  const rows = parseGameTimes(`${ANA} @ ${LAR} 9/14 8:00 PM ET`);
  assert.equal(rows[0].ok, true);
  assert.equal(rows[0].exact, false);
  assert.equal(rows[0].assumedDate, false);
  const d = new Date(rows[0].gameTimeUTC);
  assert.equal(d.getUTCMonth() + 1, 9);
  assert.equal(d.getUTCDate(), 15);
  assert.equal(d.getUTCHours(), 0);
});
