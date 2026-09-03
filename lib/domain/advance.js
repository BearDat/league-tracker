import { uid, gameWinner } from './core.js';
import { getSeriesLength, seriesWinsNeeded } from './playoffs.js';

export function advancePlayIn(games) {
  let result = [...games];
  let winner;
  let changed = true;
  while (changed) {
    changed = false;
    const playInGames = result.filter(g => g.isPlayIn);
    if (playInGames.length === 0) break;
    const maxRound = Math.max(...playInGames.map(g => g.playInRound));
    const roundGames = playInGames.filter(g => g.playInRound === maxRound);
    if (result.some(g => g.isPlayIn && g.playInRound === maxRound + 1)) break;
    if (!roundGames.every(g => g.played)) break;
    const winners = roundGames.sort((a, b) => a.bracketSlot - b.bracketSlot).map(g => {
      const w = gameWinner(g);
      return w === 'home' ? g.homeTeamId : g.awayTeamId;
    });
    if (winners.length === 1) { winner = winners[0]; break; }
    const newGames = [];
    for (let i = 0; i < winners.length; i += 2) {
      newGames.push({ id: uid('g'), date: `Play-In R${maxRound + 1}`, isPlayIn: true, playInRound: maxRound + 1, bracketSlot: i / 2, homeTeamId: winners[i], awayTeamId: winners[i + 1], awayScheduleName: null, homeScheduleName: null, awayScore: null, homeScore: null, innings: null, played: false });
    }
    result = [...result, ...newGames];
    changed = true;
  }
  return { games: result, winner };
}

export function advancePlayoffs(games, settings, seedById) {
  let result = [...games];
  let championTeamId;
  let changed = true;
  while (changed) {
    changed = false;
    const playoffRoundNums = [...new Set(result.filter(g => g.isPlayoff).map(g => g.playoffRound))].sort((a, b) => a - b);
    if (playoffRoundNums.length === 0) break;

    for (const round of playoffRoundNums) {
      const sl = getSeriesLength(settings, round);
      const winsNeeded = seriesWinsNeeded(sl);
      const roundGames = result.filter(g => g.isPlayoff && g.playoffRound === round);
      const slots = [...new Set(roundGames.map(g => g.bracketSlot))].sort((a, b) => a - b);

      let allDecided = true;
      const slotWinner = {};
      let addedGameThisRound = false;

      for (const slot of slots) {
        const slotGames = roundGames.filter(g => g.bracketSlot === slot).sort((a, b) => (a.seriesGame || 1) - (b.seriesGame || 1));
        if (slotGames.length === 1 && slotGames[0].isBye) { slotWinner[slot] = slotGames[0].homeTeamId; continue; }
        const teamIds = new Set();
        slotGames.forEach(g => { if (g.homeTeamId) teamIds.add(g.homeTeamId); if (g.awayTeamId) teamIds.add(g.awayTeamId); });
        const wins = {};
        [...teamIds].forEach(id => { wins[id] = 0; });
        slotGames.forEach(g => {
          if (!g.played) return;
          const w = gameWinner(g);
          const wid = w === 'home' ? g.homeTeamId : w === 'away' ? g.awayTeamId : null;
          if (wid != null) wins[wid] = (wins[wid] || 0) + 1;
        });
        const decidedTeam = [...teamIds].find(id => wins[id] >= winsNeeded);
        if (decidedTeam) { slotWinner[slot] = decidedTeam; continue; }
        allDecided = false;
        const gamesPlayed = slotGames.filter(g => g.played).length;
        const nextGameNum = gamesPlayed + 1;
        const hasNextGame = slotGames.some(g => (g.seriesGame || 1) === nextGameNum);
        if (!hasNextGame && gamesPlayed > 0 && gamesPlayed < sl) {
          const higherSeedId = slotGames[0].higherSeedId || slotGames[0].homeTeamId;
          const [idA, idB] = [...teamIds];
          const lowerSeedId = idA === higherSeedId ? idB : idA;
          const hostId = nextGameNum % 2 === 1 ? higherSeedId : lowerSeedId;
          const awayId = hostId === higherSeedId ? lowerSeedId : higherSeedId;
          result.push({ id: uid('g'), date: `Playoffs R${round}`, isPlayoff: true, playoffRound: round, bracketSlot: slot, seriesGame: nextGameNum, higherSeedId, homeTeamId: hostId, awayTeamId: awayId, awayScheduleName: null, homeScheduleName: null, awayScore: null, homeScore: null, innings: null, played: false });
          changed = true;
          addedGameThisRound = true;
        }
      }
      if (addedGameThisRound) break;

      const nextRoundExists = result.some(g => g.isPlayoff && g.playoffRound === round + 1);

      if (allDecided && slots.length > 0) {
        let winners = slots.map(s => slotWinner[s]);
        if (winners.length >= 2) {
          if (settings.reseedPlayoffs && seedById) {
            winners = [...winners].sort((a, b) => (seedById[a] ?? 999) - (seedById[b] ?? 999));
            const paired = [];
            for (let i = 0, j = winners.length - 1; i < j; i++, j--) paired.push(winners[i], winners[j]);
            winners = paired;
          }
          if (!nextRoundExists) {
            const newGames = [];
            for (let i = 0; i < winners.length; i += 2) {
              newGames.push({ id: uid('g'), date: `Playoffs R${round + 1}`, isPlayoff: true, playoffRound: round + 1, bracketSlot: i / 2, seriesGame: 1, higherSeedId: winners[i], awayTeamId: winners[i + 1], homeTeamId: winners[i], awayScheduleName: null, homeScheduleName: null, awayScore: null, homeScore: null, innings: null, played: false });
            }
            result = [...result, ...newGames];
            changed = true;
            break;
          } else {
            const nextRoundGames = result.filter(g => g.isPlayoff && g.playoffRound === round + 1);
            const nextSlots = [...new Set(nextRoundGames.map(g => g.bracketSlot))].sort((a, b) => a - b);
            let mismatch = false;
            nextSlots.forEach(ns => {
              const expectedA = winners[ns * 2], expectedB = winners[ns * 2 + 1];
              const slotGames = nextRoundGames.filter(g => g.bracketSlot === ns);
              const actualIds = new Set();
              slotGames.forEach(g => { if (g.homeTeamId) actualIds.add(g.homeTeamId); if (g.awayTeamId) actualIds.add(g.awayTeamId); });
              const expectedIds = new Set([expectedA, expectedB].filter(Boolean));
              if (actualIds.size !== expectedIds.size || [...expectedIds].some(id => !actualIds.has(id))) mismatch = true;
            });
            if (mismatch) {
              result = result.filter(g => !(g.isPlayoff && g.playoffRound > round));
              const newGames = [];
              for (let i = 0; i < winners.length; i += 2) {
                newGames.push({ id: uid('g'), date: `Playoffs R${round + 1}`, isPlayoff: true, playoffRound: round + 1, bracketSlot: i / 2, seriesGame: 1, higherSeedId: winners[i], awayTeamId: winners[i + 1], homeTeamId: winners[i], awayScheduleName: null, homeScheduleName: null, awayScore: null, homeScore: null, innings: null, played: false });
              }
              result = [...result, ...newGames];
              changed = true;
              break;
            }
          }
        } else if (winners.length === 1) {
          championTeamId = winners[0];
        }
      } else if (nextRoundExists) {
        result = result.filter(g => !(g.isPlayoff && g.playoffRound > round));
        changed = true;
        break;
      }
    }
  }
  return { games: result, championTeamId };
}
