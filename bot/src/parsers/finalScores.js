import { extractEmojis, splitHeadAndGroups, contentLines, EMOJI_RE } from './util.js';

const EMOJI_RE_SOURCE = EMOJI_RE.source;

const SCORE_RE = /(\d{1,3})\s*[-–—]\s*(\d{1,3})/;
const FINAL_RE = /\bF(?:INAL)?\s*(?:\/\s*(\d{1,2}))?\b/i;

function residualOf(groupText, matchIndex) {
  const before = groupText.slice(0, matchIndex);
  return before
    .replace(new RegExp(EMOJI_RE_SOURCE, 'g'), ' ')
    .replace(/[\s,;·—–-]+$/, '')
    .trim();
}

function parseSeriesNote(groupText) {
  const emojis = extractEmojis(groupText);
  const emojiId = emojis.length > 0 ? emojis[emojis.length - 1].id : null;

  const leads = groupText.match(/\bleads?\s+(?:the\s+)?series\s+(\d+)\s*[-–—]\s*(\d+)/i);
  if (leads) {
    return { note: { type: 'leads', emojiId, wins: Number(leads[1]), losses: Number(leads[2]) }, residual: residualOf(groupText, leads.index) };
  }
  const tied = groupText.match(/\bseries\s+(?:is\s+)?tied\s+(\d+)\s*[-–—]\s*(\d+)/i);
  if (tied) {
    return { note: { type: 'tied', emojiId: null, wins: Number(tied[1]), losses: Number(tied[2]) }, residual: residualOf(groupText, tied.index) };
  }
  const won = groupText.match(/\b(?:wins?|won|takes?|take)\s+(?:the\s+)?series\s+(\d+)\s*[-–—]\s*(\d+)/i);
  if (won) {
    return { note: { type: 'wins', emojiId, wins: Number(won[1]), losses: Number(won[2]) }, residual: residualOf(groupText, won.index) };
  }
  const advance = groupText.match(/\badvances?\b/i);
  if (advance) {
    return { note: { type: 'advance', emojiId, label: groupText.trim() }, residual: residualOf(groupText, advance.index) };
  }
  const eliminated = groupText.match(/\belimin/i);
  if (eliminated) {
    return { note: { type: 'eliminated', emojiId, label: groupText.trim() }, residual: residualOf(groupText, eliminated.index) };
  }
  return null;
}

export function parseFinalScoreLine(line) {
  const { head, groups } = splitHeadAndGroups(line);
  const scoreMatch = head.match(SCORE_RE);
  if (!scoreMatch) return { ok: false, error: 'no score found' };

  const emojis = extractEmojis(head);
  if (emojis.length < 2) return { ok: false, error: 'expected two team emoji' };

  const scoreIndex = head.indexOf(scoreMatch[0]);
  const before = emojis.filter(e => e.index < scoreIndex);
  const after = emojis.filter(e => e.index >= scoreIndex + scoreMatch[0].length);
  if (before.length === 0 || after.length === 0) {
    return { ok: false, error: 'could not place team emoji around the score' };
  }

  const leftEmoji = before[before.length - 1];
  const rightEmoji = after[0];
  if (leftEmoji.id === rightEmoji.id) return { ok: false, error: 'both sides use the same emoji' };

  const finalMatch = head.match(FINAL_RE);
  const innings = finalMatch && finalMatch[1] ? Number(finalMatch[1]) : null;

  const series = [];
  const notes = [];
  groups.forEach(g => {
    const parsed = parseSeriesNote(g.text);
    if (parsed) {
      series.push(parsed.note);
      if (parsed.residual) notes.push(parsed.residual);
    } else {
      notes.push(g.text.trim());
    }
  });

  return {
    ok: true,
    kind: 'final_score',
    left: { emojiId: leftEmoji.id, emojiName: leftEmoji.name, score: Number(scoreMatch[1]) },
    right: { emojiId: rightEmoji.id, emojiName: rightEmoji.name, score: Number(scoreMatch[2]) },
    isFinal: !!finalMatch,
    innings,
    series,
    notes,
    raw: line,
  };
}

export function parseFinalScores(content) {
  const results = [];
  contentLines(content).forEach(line => {
    const parsed = parseFinalScoreLine(line);
    if (parsed.ok) results.push(parsed);
    else results.push({ ok: false, error: parsed.error, raw: line });
  });
  return results;
}
