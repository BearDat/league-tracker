import { extractEmojis, trailingGroups, classifyGroup, parseNameList, contentLines } from './util.js';

const BULLET_RE = /^[-–—•*]\s*/;
const LABEL_RE = /^([A-Za-z][A-Za-z ]{0,20}?)\s*:\s*/;

const ACTION_ALIASES = {
  trade: 'trade',
  trades: 'trade',
  receive: 'trade',
  receives: 'trade',
  release: 'release',
  releases: 'release',
  released: 'release',
  waive: 'release',
  waives: 'release',
  cut: 'release',
  sign: 'sign',
  signs: 'sign',
  signed: 'sign',
  signing: 'sign',
  add: 'sign',
  adds: 'sign',
};

const ACTION_VERB_RE = /\b(receives?|releases?|released|waives?|signs?|signed|cut|adds?)\s*:\s*/i;

function normalizeAction(word) {
  return ACTION_ALIASES[String(word || '').trim().toLowerCase()] || null;
}

function parseActionLine(line) {
  const emojis = extractEmojis(line);
  if (emojis.length === 0) return null;
  const verbMatch = line.match(ACTION_VERB_RE);
  if (!verbMatch) return null;
  const action = normalizeAction(verbMatch[1]);
  if (!action) return null;
  const teamEmoji = emojis.filter(e => e.index < verbMatch.index).pop() || emojis[0];
  const tail = line.slice(verbMatch.index + verbMatch[0].length);
  const { rest, groups } = trailingGroups(tail);
  const classified = groups.map(classifyGroup);
  const names = parseNameList(rest);
  const cap = classified.find(g => g.kind === 'cap') || null;
  const rating = classified.find(g => g.kind === 'rating') || null;
  const notes = classified.filter(g => g.kind === 'note').map(g => g.text);
  return {
    action,
    emojiId: teamEmoji.id,
    emojiName: teamEmoji.name,
    names,
    cap: cap ? { used: cap.used, max: cap.max } : null,
    rating,
    notes,
    raw: line,
  };
}

function splitEntries(content) {
  const lines = contentLines(content);
  const entries = [];
  let current = null;
  lines.forEach(line => {
    const isBullet = BULLET_RE.test(line);
    const body = isBullet ? line.replace(BULLET_RE, '') : line;
    let declared = null;
    let remainder = body;
    if (isBullet) {
      const label = body.match(LABEL_RE);
      if (label && normalizeAction(label[1])) {
        declared = normalizeAction(label[1]);
        remainder = body.slice(label[0].length);
      }
    }
    if (isBullet || !current) {
      current = { declared, lines: [] };
      entries.push(current);
    }
    if (remainder.trim()) current.lines.push(remainder.trim());
  });
  return entries;
}

export function parseTransactions(content) {
  const results = [];
  splitEntries(content).forEach(entry => {
    const actions = entry.lines.map(parseActionLine).filter(Boolean);
    if (actions.length === 0) {
      results.push({ ok: false, error: 'no recognizable transaction action', raw: entry.lines.join('\n') });
      return;
    }
    const kind = entry.declared || actions[0].action;
    const raw = entry.lines.join('\n');

    if (kind === 'trade') {
      const sides = actions.filter(a => a.action === 'trade');
      if (sides.length < 2) {
        results.push({ ok: false, error: 'a trade needs at least two receiving teams', raw });
        return;
      }
      if (sides.some(s => s.names.length === 0)) {
        results.push({ ok: false, error: 'a trade side lists no players', raw });
        return;
      }
      results.push({
        ok: true,
        kind: 'trade',
        sides: sides.map(s => ({
          emojiId: s.emojiId,
          emojiName: s.emojiName,
          players: s.names,
          starsReceived: s.rating && s.rating.starLevel != null ? s.rating.starLevel : null,
          capAfter: s.cap,
        })),
        raw,
      });
      return;
    }

    actions.forEach(a => {
      if (a.names.length === 0) {
        results.push({ ok: false, error: `${a.action} lists no players`, raw: a.raw });
        return;
      }
      const perPlayerRating = a.names.length === 1 && a.rating ? a.rating : null;
      results.push({
        ok: true,
        kind: a.action,
        emojiId: a.emojiId,
        emojiName: a.emojiName,
        players: a.names,
        starLevel: perPlayerRating ? perPlayerRating.starLevel : undefined,
        rookie: perPlayerRating ? perPlayerRating.rookie : false,
        capAfter: a.cap,
        notes: a.notes,
        raw: a.raw,
      });
    });
  });
  return results;
}
