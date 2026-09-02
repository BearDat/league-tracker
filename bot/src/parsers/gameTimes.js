import { extractEmojis, stripEmojis, contentLines, easternToUtcMs, easternPartsNow } from './util.js';

const DISCORD_TS_RE = /<t:(\d{6,}):?[tTdDfFR]?>/;
const CLOCK_RE = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i;
const DATE_RE = /\b(\d{1,2})\s*[/\-]\s*(\d{1,2})(?:\s*[/\-]\s*(\d{2,4}))?\b/;
const SEPARATOR_RE = /\s(@|vs\.?|v\.?)\s/i;

function resolveDateWords(text, base) {
  if (/\btomorrow\b/i.test(text)) {
    const d = new Date(Date.UTC(base.year, base.month - 1, base.day + 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  return base;
}

export function parseGameTimeLine(line, nowMs = Date.now()) {
  const emojis = extractEmojis(line);
  if (emojis.length < 2) return { ok: false, error: 'expected two team emoji', raw: line };

  const sepMatch = line.match(SEPARATOR_RE);
  const separator = sepMatch ? sepMatch[1].replace(/\.$/, '').toLowerCase() : null;

  const ts = line.match(DISCORD_TS_RE);
  if (ts) {
    return {
      ok: true,
      kind: 'game_time',
      left: { emojiId: emojis[0].id, emojiName: emojis[0].name },
      right: { emojiId: emojis[1].id, emojiName: emojis[1].name },
      separator,
      gameTimeUTC: Number(ts[1]) * 1000,
      exact: true,
      raw: line,
    };
  }

  const text = stripEmojis(line);
  const clock = text.match(CLOCK_RE);
  if (!clock) return { ok: false, error: 'no game time found', raw: line };

  let hour = Number(clock[1]) % 12;
  if (/pm/i.test(clock[3])) hour += 12;
  const minute = clock[2] ? Number(clock[2]) : 0;

  const base = easternPartsNow(nowMs);
  let datePart = resolveDateWords(text, base);
  const explicitDate = text.match(DATE_RE);
  if (explicitDate) {
    const month = Number(explicitDate[1]);
    const day = Number(explicitDate[2]);
    let year = explicitDate[3] ? Number(explicitDate[3]) : base.year;
    if (year < 100) year += 2000;
    datePart = { year, month, day };
  }

  const gameTimeUTC = easternToUtcMs(datePart.year, datePart.month, datePart.day, hour, minute);

  return {
    ok: true,
    kind: 'game_time',
    left: { emojiId: emojis[0].id, emojiName: emojis[0].name },
    right: { emojiId: emojis[1].id, emojiName: emojis[1].name },
    separator,
    gameTimeUTC,
    exact: false,
    assumedDate: !explicitDate,
    raw: line,
  };
}

export function parseGameTimes(content, nowMs = Date.now()) {
  return contentLines(content).map(line => parseGameTimeLine(line, nowMs));
}
