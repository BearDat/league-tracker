import { resolveWithLearning } from './teams.js';
import { findScheduledGame, orientScores, describeGame, planPlayoffContinuation } from './games.js';
import { findRosterPlayer, findPlayerFuzzy, rosterStarTotal, gameWinner } from '../league/core.js';

function lowResult(kind, reasons, display, partial) {
  return { kind, confidence: 'low', reasons, display, item: partial || null };
}

function seriesWinsIncluding(season, game, homeScore, awayScore) {
  if (!game.isPlayoff) return null;
  const slotGames = (season.games || []).filter(g => g.isPlayoff && g.playoffRound === game.playoffRound && g.bracketSlot === game.bracketSlot);
  const wins = {};
  slotGames.forEach(g => {
    const effective = g.id === game.id ? { ...g, homeScore, awayScore, played: true } : g;
    if (!effective.played) return;
    const w = gameWinner(effective);
    const wid = w === 'home' ? effective.homeTeamId : w === 'away' ? effective.awayTeamId : null;
    if (wid != null) wins[wid] = (wins[wid] || 0) + 1;
  });
  return wins;
}

async function resolveFinalScore(parsed, ctx) {
  const reasons = [];
  const left = await resolveWithLearning(parsed.left.emojiId, parsed.left.emojiName, ctx.directory, ctx.aliases, ctx.learn !== false);
  const right = await resolveWithLearning(parsed.right.emojiId, parsed.right.emojiName, ctx.directory, ctx.aliases, ctx.learn !== false);
  const display = {
    line: parsed.raw,
    left: `${parsed.left.emojiName} → ${left.name || 'unresolved'} (${parsed.left.score})`,
    right: `${parsed.right.emojiName} → ${right.name || 'unresolved'} (${parsed.right.score})`,
  };

  [left, right].forEach(r => {
    if (r.confidence !== 'high' && r.reason) reasons.push(r.reason);
  });
  if (!left.teamId || !right.teamId) {
    return lowResult('final_score', reasons.length ? reasons : ['could not resolve both teams'], display, {
      unresolvedEmoji: [
        !left.teamId ? { emojiId: parsed.left.emojiId, emojiName: parsed.left.emojiName, candidates: left.candidates } : null,
        !right.teamId ? { emojiId: parsed.right.emojiId, emojiName: parsed.right.emojiName, candidates: right.candidates } : null,
      ].filter(Boolean),
    });
  }
  if (left.teamId === right.teamId) {
    return lowResult('final_score', ['both emoji resolved to the same team'], display);
  }
  if (parsed.forfeitHint) reasons.push('line says FFT — confirm whether this was a forfeit before I record it');

  let found = findScheduledGame(ctx.season, left.teamId, right.teamId);
  let newGame = null;
  if (!found.game) {
    const plan = planPlayoffContinuation(ctx.season, left.teamId, right.teamId);
    if (plan && plan.game) {
      newGame = plan.game;
      found = { game: plan.game, candidates: [plan.game], confidence: 'high', reason: null };
      display.created = `Game ${plan.nextGameNum} of a best-of-${plan.seriesLength} in Playoffs R${plan.round}, not on the schedule yet, so I will add it`;
    } else {
      const why = plan && plan.blocked ? plan.blocked : found.reason;
      return lowResult('final_score', [...reasons, why], display, {
        teams: { leftTeamId: left.teamId, rightTeamId: right.teamId },
      });
    }
  }
  if (found.confidence !== 'high') reasons.push(found.reason);

  const oriented = orientScores(found.game, left.teamId, parsed.left.score, right.teamId, parsed.right.score);
  if (!oriented) return lowResult('final_score', [...reasons, 'could not line the scores up with the scheduled game'], display);

  display.game = describeGame(found.game, ctx.nameFor);
  display.result = `${ctx.nameFor(found.game.awayTeamId)} ${oriented.awayScore} @ ${ctx.nameFor(found.game.homeTeamId)} ${oriented.homeScore}`;

  parsed.series.forEach(note => {
    if (note.type !== 'leads' && note.type !== 'wins') return;
    const wins = seriesWinsIncluding(ctx.season, found.game, oriented.homeScore, oriented.awayScore);
    if (!wins) return;
    const noted = note.emojiId === parsed.left.emojiId ? left.teamId : note.emojiId === parsed.right.emojiId ? right.teamId : null;
    if (!noted) return;
    const other = noted === left.teamId ? right.teamId : left.teamId;
    const actual = `${wins[noted] || 0}-${wins[other] || 0}`;
    const claimed = `${note.wins}-${note.losses}`;
    if (actual !== claimed) reasons.push(`series note says ${claimed} but the schedule works out to ${actual}`);
  });

  const item = {
    gameId: found.game.id,
    homeScore: oriented.homeScore,
    awayScore: oriented.awayScore,
    innings: parsed.innings,
    notes: parsed.notes.join(' — ') || null,
    newGame,
  };
  return { kind: 'final_score', confidence: reasons.length === 0 ? 'high' : 'low', reasons, display, item };
}

async function resolveGameTime(parsed, ctx) {
  const reasons = [];
  const left = await resolveWithLearning(parsed.left.emojiId, parsed.left.emojiName, ctx.directory, ctx.aliases, ctx.learn !== false);
  const right = await resolveWithLearning(parsed.right.emojiId, parsed.right.emojiName, ctx.directory, ctx.aliases, ctx.learn !== false);
  const display = { line: parsed.raw, when: new Date(parsed.gameTimeUTC).toISOString() };
  [left, right].forEach(r => {
    if (r.confidence !== 'high' && r.reason) reasons.push(r.reason);
  });
  if (!left.teamId || !right.teamId) {
    return lowResult('game_time', reasons.length ? reasons : ['could not resolve both teams'], display);
  }
  if (!parsed.exact) reasons.push('time was read from text, not a Discord timestamp');
  if (parsed.assumedDate) reasons.push('no date given — assumed today in Eastern time');

  const found = findScheduledGame(ctx.season, left.teamId, right.teamId);
  if (!found.game) return lowResult('game_time', [...reasons, found.reason], display);
  if (found.confidence !== 'high') reasons.push(found.reason);

  display.game = describeGame(found.game, ctx.nameFor);
  return {
    kind: 'game_time',
    confidence: reasons.length === 0 ? 'high' : 'low',
    reasons,
    display,
    item: { gameId: found.game.id, gameTimeUTC: parsed.gameTimeUTC },
  };
}

async function resolveTrade(parsed, ctx) {
  const reasons = [];
  const sides = [];
  for (const side of parsed.sides) {
    const team = await resolveWithLearning(side.emojiId, side.emojiName, ctx.directory, ctx.aliases, ctx.learn !== false);
    if (team.confidence !== 'high' && team.reason) reasons.push(team.reason);
    sides.push({ ...side, teamId: team.teamId, teamName: team.name });
  }
  const display = {
    line: parsed.raw,
    sides: sides.map(s => `${s.teamName || s.emojiName} receive ${s.players.join(', ')}`),
  };
  if (sides.some(s => !s.teamId)) {
    return lowResult('trade', reasons.length ? reasons : ['could not resolve every team'], display);
  }

  const resolvedSides = [];
  for (const side of sides) {
    const playerIds = [];
    for (const name of side.players) {
      const hit = findPlayerFuzzy(ctx.season, name);
      if (!hit.match) {
        reasons.push(hit.candidates.length > 1
          ? `"${name}" matches ${hit.candidates.length} players`
          : `"${name}" is not on any roster`);
        continue;
      }
      if (!hit.exact) reasons.push(`"${name}" matched "${hit.match.player.name}" loosely`);
      if (hit.match.teamId === side.teamId) reasons.push(`"${hit.match.player.name}" is already on ${side.teamName}`);
      playerIds.push(hit.match.player.id);
    }
    resolvedSides.push({ teamId: side.teamId, teamName: side.teamName, playerIds, capAfter: side.capAfter });
  }

  if (resolvedSides.some(s => s.playerIds.length === 0)) {
    return lowResult('trade', [...reasons, 'a trade side has no resolvable players'], display, { sides: resolvedSides });
  }

  resolvedSides.forEach(side => {
    if (!side.capAfter) return;
    const member = (ctx.season.members || []).find(m => m.teamId === side.teamId);
    if (!member) return;
    const leaving = new Set(resolvedSides.filter(s => s.teamId !== side.teamId).flatMap(s => s.playerIds));
    const incoming = resolvedSides
      .filter(s => s.teamId === side.teamId)
      .flatMap(s => s.playerIds)
      .map(id => findPlayerById(ctx.season, id))
      .filter(Boolean);
    const kept = (member.roster || []).filter(p => !leaving.has(p.id));
    const projected = rosterStarTotal([...kept, ...incoming]);
    if (Math.abs(projected - side.capAfter.used) > 0.01) {
      reasons.push(`${side.teamName} should end at ${side.capAfter.used} stars but the rosters work out to ${projected}`);
    }
  });

  return {
    kind: 'trade',
    confidence: reasons.length === 0 ? 'high' : 'low',
    reasons,
    display,
    item: { sides: resolvedSides.map(s => ({ teamId: s.teamId, playerIds: s.playerIds })) },
  };
}

function findPlayerById(season, playerId) {
  for (const member of season.members || []) {
    const hit = (member.roster || []).find(p => p.id === playerId);
    if (hit) return hit;
  }
  return (season.freeAgents || []).find(p => p.id === playerId) || null;
}

async function resolveSign(parsed, ctx) {
  const reasons = [];
  const team = await resolveWithLearning(parsed.emojiId, parsed.emojiName, ctx.directory, ctx.aliases, ctx.learn !== false);
  if (team.confidence !== 'high' && team.reason) reasons.push(team.reason);
  const name = parsed.players[0];
  if (parsed.players.length > 1) reasons.push('more than one player on a single signing line');
  const display = { line: parsed.raw, team: team.name || parsed.emojiName, player: name };
  if (!team.teamId) return lowResult('sign', reasons.length ? reasons : ['could not resolve the team'], display);

  const existing = findRosterPlayer(ctx.season, name);
  if (existing && existing.location === 'roster') {
    reasons.push(`"${name}" is already on ${ctx.nameFor(existing.teamId)}`);
    return lowResult('sign', reasons, display);
  }
  if (!existing) {
    const fuzzy = findPlayerFuzzy(ctx.season, name);
    if (fuzzy.candidates.length > 0) {
      reasons.push(`"${name}" is new, but resembles ${fuzzy.candidates.map(c => c.player.name).join(', ')}`);
    }
  }
  return {
    kind: 'sign',
    confidence: reasons.length === 0 ? 'high' : 'low',
    reasons,
    display,
    item: {
      teamId: team.teamId,
      playerId: existing ? existing.player.id : null,
      playerName: name,
      starLevel: parsed.starLevel,
    },
  };
}

async function resolveRelease(parsed, ctx) {
  const reasons = [];
  const team = await resolveWithLearning(parsed.emojiId, parsed.emojiName, ctx.directory, ctx.aliases, ctx.learn !== false);
  if (team.confidence !== 'high' && team.reason) reasons.push(team.reason);
  const name = parsed.players[0];
  if (parsed.players.length > 1) reasons.push('more than one player on a single release line');
  const display = { line: parsed.raw, team: team.name || parsed.emojiName, player: name };
  if (!team.teamId) return lowResult('release', reasons.length ? reasons : ['could not resolve the team'], display);

  const hit = findRosterPlayer(ctx.season, name);
  if (!hit || hit.location !== 'roster') {
    return lowResult('release', [...reasons, `"${name}" is not on any roster`], display);
  }
  if (hit.teamId !== team.teamId) {
    reasons.push(`"${hit.player.name}" is on ${ctx.nameFor(hit.teamId)}, not ${team.name}`);
  }
  return {
    kind: 'release',
    confidence: reasons.length === 0 ? 'high' : 'low',
    reasons,
    display,
    item: { teamId: team.teamId, playerId: hit.player.id },
  };
}

async function resolveDiscipline(parsed, ctx) {
  const reasons = [];
  const isBan = parsed.kind === 'ban' || parsed.kind === 'unban';
  let teamId = null;
  let teamName = null;
  if (parsed.emojiId) {
    const team = await resolveWithLearning(parsed.emojiId, parsed.emojiName, ctx.directory, ctx.aliases, ctx.learn !== false);
    if (team.confidence !== 'high' && team.reason) reasons.push(team.reason);
    teamId = team.teamId;
    teamName = team.name;
  }
  const display = {
    line: parsed.raw,
    team: teamName || parsed.emojiName || 'none',
    player: parsed.player,
    reason: parsed.reason || 'none given',
  };

  const hit = findRosterPlayer(ctx.season, parsed.player);
  if (!hit) {
    const fuzzy = findPlayerFuzzy(ctx.season, parsed.player);
    if (!fuzzy.match) {
      return lowResult(parsed.kind, [...reasons, `"${parsed.player}" is not on any roster or in free agency`], display);
    }
    reasons.push(`"${parsed.player}" matched "${fuzzy.match.player.name}" loosely`);
    return lowResult(parsed.kind, reasons, display, {
      playerId: fuzzy.match.player.id,
      reason: parsed.reason,
      games: parsed.games,
    });
  }
  if (teamId && hit.teamId && hit.teamId !== teamId) {
    reasons.push(`"${hit.player.name}" is on ${ctx.nameFor(hit.teamId)}, not ${teamName}`);
  }
  if (parsed.kind === 'suspend' && parsed.indefinite) {
    reasons.push('suspension is indefinite — no game count recorded');
  }
  if (!isBan && hit.location !== 'roster') {
    return lowResult(parsed.kind, [...reasons, `"${hit.player.name}" is a free agent, so there is no team to suspend them from`], display);
  }

  return {
    kind: parsed.kind,
    confidence: reasons.length === 0 ? 'high' : 'low',
    reasons,
    display,
    item: {
      playerId: hit.player.id,
      reason: parsed.reason || '',
      games: parsed.games == null ? null : parsed.games,
      suspended: parsed.kind === 'suspend',
      banned: parsed.kind === 'ban',
    },
  };
}

const RESOLVERS = {
  final_score: resolveFinalScore,
  game_time: resolveGameTime,
  trade: resolveTrade,
  sign: resolveSign,
  release: resolveRelease,
  suspend: resolveDiscipline,
  unsuspend: resolveDiscipline,
  ban: resolveDiscipline,
  unban: resolveDiscipline,
};

export async function resolveParsed(parsed, ctx) {
  if (!parsed.ok && parsed.skip) {
    return { kind: 'skip', confidence: 'skip', reasons: [parsed.error], display: { line: parsed.raw }, item: null };
  }
  if (!parsed.ok) {
    return { kind: 'unparsed', confidence: 'low', reasons: [parsed.error], display: { line: parsed.raw }, item: null };
  }
  const resolver = RESOLVERS[parsed.kind];
  if (!resolver) {
    return { kind: parsed.kind, confidence: 'low', reasons: [`no resolver for ${parsed.kind}`], display: { line: parsed.raw }, item: null };
  }
  return resolver(parsed, ctx);
}
