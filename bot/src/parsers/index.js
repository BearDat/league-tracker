import { parseFinalScores } from './finalScores.js';
import { parseTransactions } from './transactions.js';
import { parseSuspensions } from './suspensions.js';
import { parseGameTimes } from './gameTimes.js';

export const PARSERS = {
  final_scores: parseFinalScores,
  transactions: parseTransactions,
  suspensions: parseSuspensions,
  game_times: parseGameTimes,
};

export function parseForChannel(kind, content) {
  const parser = PARSERS[kind];
  if (!parser) return [];
  return parser(content);
}

export { parseFinalScores, parseTransactions, parseSuspensions, parseGameTimes };
