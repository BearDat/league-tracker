import { readFileSync } from 'node:fs';
import { parseForChannel, PARSERS } from './parsers/index.js';
import { applyResolved } from './handlers.js';
import { resolveParsed } from './resolve/index.js';
import { getLeagueRaw } from './store.js';
import { getActiveSeason } from './league/core.js';
import { loadTeamDirectory, loadEmojiAliases } from './resolve/teams.js';
import { APPLIERS } from './apply/index.js';
import { describeExisting } from './resolve/games.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force');
const explain = args.includes('--explain');
const positional = args.filter(a => !a.startsWith('--'));
const kind = positional[0];
const file = positional[1];

if (!kind || !PARSERS[kind] || !file) {
  console.error(`usage: node src/ingest.js <${Object.keys(PARSERS).join('|')}> <file> [--apply] [--force] [--explain]`);
  console.error('');
  console.error('  no flags  simulate the whole file in memory, write nothing');
  console.error('  --apply   write the results the bot is confident about');
  console.error('  --force   also accept low-confidence results');
  console.error('  --explain show every game already recorded between the two teams');
  process.exit(1);
}

function dumpExisting(season, nameFor, resolved) {
  const teams = resolved.item && resolved.item.teams;
  if (!teams) return;
  const rows = describeExisting(season, teams.leftTeamId, teams.rightTeamId);
  console.log(`            -- ${nameFor(teams.leftTeamId)} vs ${nameFor(teams.rightTeamId)}`);
  if (rows.length === 0) {
    console.log('            -- no games at all between these two teams');
    return;
  }
  rows.forEach(r => {
    console.log(`            -- ${r.played ? 'played  ' : 'unplayed'} ${String(r.score || '').padEnd(7)} playoff=${r.isPlayoff} round=${r.playoffRound} slot=${r.bracketSlot} game=${r.seriesGame}`);
  });
}

const raw = await getLeagueRaw();
if (!raw) {
  console.error('league not found');
  process.exit(1);
}

let league = raw.data;
const directory = await loadTeamDirectory(getActiveSeason(league));
const aliases = await loadEmojiAliases();
const byId = new Map(directory.map(t => [t.teamId, t.name]));
const nameFor = (id) => byId.get(id) || 'Unknown team';
const ctxFor = (lg) => ({
  league: lg,
  season: getActiveSeason(lg),
  directory,
  aliases,
  learn: false,
  nameFor,
  directoryForSeason: (target) => (target.id === getActiveSeason(lg).id ? directory : loadTeamDirectory(target)),
});

const content = readFileSync(file, 'utf8');
const rows = parseForChannel(kind, content);

let done = 0;
let skipped = 0;
let held = 0;

console.log(`${rows.length} line${rows.length === 1 ? '' : 's'} parsed from ${file}`);
console.log(apply
  ? (force ? 'mode: APPLY (forced)' : 'mode: APPLY')
  : 'mode: simulation, nothing will be written');
console.log('');

for (const parsed of rows) {
  const ctx = ctxFor(league);
  const resolved = await resolveParsed(parsed, ctx);

  if (resolved.kind === 'skip') {
    skipped += 1;
    console.log(`-  skip     ${resolved.reasons[0]}`);
    continue;
  }

  const label = resolved.display.result || resolved.display.line || '';
  const short = label.length > 74 ? `${label.slice(0, 73)}…` : label;

  if (!resolved.item) {
    held += 1;
    console.log(`!  blocked  ${short}`);
    resolved.reasons.forEach(r => console.log(`            ${r}`));
    if (explain) dumpExisting(ctx.season, nameFor, resolved);
    continue;
  }

  const confident = resolved.confidence === 'high';
  if (!confident && !force) {
    held += 1;
    console.log(`?  review   ${short}`);
    if (resolved.display.game) console.log(`            ${resolved.display.game}`);
    resolved.reasons.forEach(r => console.log(`            ${r}`));
    if (explain) dumpExisting(ctx.season, nameFor, resolved);
    continue;
  }

  if (apply) {
    try {
      const result = await applyResolved(resolved, ctx);
      if (!result.applied) {
        held += 1;
        console.log(`!  refused  ${short}`);
        console.log(`            ${result.blocked}`);
        continue;
      }
      done += 1;
      console.log(`+  wrote    ${result.summary}`);
      if (resolved.display.created) console.log(`            ${resolved.display.created}`);
      const fresh = await getLeagueRaw();
      league = fresh.data;
    } catch (e) {
      held += 1;
      console.log(`!  failed   ${short}`);
      console.log(`            ${e.message}`);
    }
    continue;
  }

  const applier = APPLIERS[resolved.kind];
  const simulated = applier(league, resolved.item, nameFor);
  league = simulated.league;
  done += 1;
  console.log(`+  ${confident ? 'ready   ' : 'forced  '} ${simulated.summary}`);
  if (resolved.display.game) console.log(`            ${resolved.display.game}`);
  if (resolved.display.created) console.log(`            ${resolved.display.created}`);
  if (!confident) resolved.reasons.forEach(r => console.log(`            ${r}`));
}

console.log('');
console.log(apply
  ? `${done} written, ${held} held for review, ${skipped} skipped`
  : `${done} would be written, ${held} need review, ${skipped} skipped`);

if (!apply && done > 0) {
  const season = getActiveSeason(league);
  const playoff = (season.games || []).filter(g => g.isPlayoff);
  console.log('');
  console.log(`projected bracket: ${playoff.length} playoff games, champion=${season.championTeamId ? nameFor(season.championTeamId) : '-'}`);
  const rounds = [...new Set(playoff.map(g => g.playoffRound))].sort((a, b) => a - b);
  rounds.forEach(r => {
    const slots = [...new Set(playoff.filter(g => g.playoffRound === r).map(g => g.bracketSlot))].sort((a, b) => a - b);
    slots.forEach(slot => {
      const gs = playoff.filter(g => g.playoffRound === r && g.bracketSlot === slot);
      const wins = {};
      gs.forEach(g => {
        if (!g.played) return;
        const hs = Number(g.homeScore);
        const as = Number(g.awayScore);
        const w = hs > as ? g.homeTeamId : as > hs ? g.awayTeamId : null;
        if (w) wins[w] = (wins[w] || 0) + 1;
      });
      const parts = Object.entries(wins).map(([id, w]) => `${nameFor(id)} ${w}`);
      const pending = gs.filter(g => !g.played).length;
      console.log(`   R${r} slot${slot}: ${parts.join('  |  ') || '(no results)'}${pending ? `  (+${pending} unplayed)` : ''}`);
    });
  });
}
process.exit(0);
