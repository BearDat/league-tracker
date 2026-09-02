import { config } from './config.js';
import { supabase, getLeagueRaw } from './store.js';
import { getActiveSeason } from './league/core.js';

const { data: keys, error } = await supabase
  .from('kv_store')
  .select('key, updated_at')
  .like('key', 'league:%');

console.log('bot is configured for LEAGUE_ID:', config.leagueId);
console.log('');

if (error) {
  console.log('could not list leagues:', error.message);
} else {
  console.log(`leagues present in this database: ${keys.length}`);
  keys.forEach(k => {
    const id = k.key.replace(/^league:/, '');
    console.log(`  ${id === config.leagueId ? '->' : '  '} ${id}   last written ${k.updated_at}`);
  });
}
console.log('');

const raw = await getLeagueRaw();
if (!raw) {
  console.log('the configured league was not found.');
  process.exit(1);
}

const league = raw.data;
const active = getActiveSeason(league);
console.log('league name :', league.name || '(unnamed)');
console.log('seasons     :', (league.seasons || []).length);
console.log('activeSeason:', league.activeSeasonId);
console.log('');

(league.seasons || []).forEach(s => {
  const games = s.games || [];
  const playoff = games.filter(g => g.isPlayoff).length;
  const playIn = games.filter(g => g.isPlayIn).length;
  const played = games.filter(g => g.played).length;
  const mark = active && s.id === active.id ? '->' : '  ';
  console.log(`${mark} ${(s.name || s.id).padEnd(22)} games=${String(games.length).padStart(4)} played=${String(played).padStart(4)} playoff=${String(playoff).padStart(3)} playIn=${String(playIn).padStart(3)} teams=${String((s.members || []).length).padStart(3)} champion=${s.championTeamId || '-'}`);
});

console.log('');
if (!active) process.exit(0);

const { getTeam } = await import('./store.js');
const memberIds = (active.members || []).map(m => m.teamId).filter(Boolean);
const teams = await Promise.all(memberIds.map(id => getTeam(id)));
const nameById = {};
memberIds.forEach((id, i) => {
  const member = (active.members || []).find(m => m.teamId === id);
  const rebrand = member && member.rebrand;
  nameById[id] = (rebrand && rebrand.name) || (teams[i] && teams[i].name) || id;
});

console.log(`active season members (${memberIds.length}):`);
memberIds.forEach(id => console.log(`   ${id}  ${nameById[id]}  active=${((active.members || []).find(m => m.teamId === id) || {}).active !== false}`));
console.log('');

const nameOf = (id) => (id ? (nameById[id] || `UNKNOWN(${id})`) : 'null');

const playoffGames = (active.games || []).filter(g => g.isPlayoff || g.isPlayIn);
console.log(`playoff / play-in games (${playoffGames.length}):`);
playoffGames
  .slice()
  .sort((a, b) => (a.playoffRound || a.playInRound || 0) - (b.playoffRound || b.playInRound || 0)
    || (a.bracketSlot || 0) - (b.bracketSlot || 0)
    || (a.seriesGame || 1) - (b.seriesGame || 1))
  .forEach(g => {
    const score = g.played ? `${g.awayScore}-${g.homeScore}` : 'unplayed';
    console.log(`   R${g.playoffRound || g.playInRound} slot${g.bracketSlot} game${g.seriesGame || 1}  ${String(score).padEnd(9)} bye=${!!g.isBye}  ${nameOf(g.awayTeamId)} @ ${nameOf(g.homeTeamId)}   date=${g.date}`);
  });

console.log('');
console.log('settings.playoffSpots :', (active.settings || {}).playoffSpots);
console.log('settings.seriesLength :', (active.settings || {}).seriesLength);
console.log('settings.seriesLengths:', JSON.stringify((active.settings || {}).seriesLengths));
console.log('settings.playoffRoundNames:', JSON.stringify((active.settings || {}).playoffRoundNames));
process.exit(0);
