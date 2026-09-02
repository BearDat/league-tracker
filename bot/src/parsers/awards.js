import { extractEmojis } from './util.js';

const HEADER_RE = /season\s*(\d+)\s*awards/i;
const LABEL_SEP_RE = /:|\s[-\u2013\u2014]\s/;
const EMOJI_SPAN_RE = /<a?:[A-Za-z0-9_~]+:\d+>/g;

function withoutEmojis(text) {
  return String(text == null ? '' : text).replace(new RegExp(EMOJI_SPAN_RE.source, 'g'), ' ');
}

function tidy(text) {
  return String(text == null ? '' : text)
    .replace(/[*_]{2,}/g, '')
    .replace(/^[\s*_~`>]+|[\s*_~`>]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPlayer(text) {
  return String(text == null ? '' : text)
    .replace(/[*_]{2,}/g, '')
    .replace(/^[\s*~`,.]+|[\s*~`,.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitNames(text) {
  return String(text == null ? '' : text)
    .split(/\s*,\s*|\s+and\s+/i)
    .map(cleanPlayer)
    .filter(Boolean);
}

export function parseWinners(text) {
  const emojis = extractEmojis(text);
  if (emojis.length === 0) {
    return splitNames(text).map(player => ({ emojiId: null, emojiName: null, player }));
  }
  const out = [];
  emojis.forEach((emoji, i) => {
    const start = emoji.index + emoji.raw.length;
    const end = i + 1 < emojis.length ? emojis[i + 1].index : text.length;
    splitNames(text.slice(start, end)).forEach((player, n) => {
      out.push({
        emojiId: n === 0 ? emoji.id : null,
        emojiName: n === 0 ? emoji.name : null,
        player,
      });
    });
  });
  return out;
}

function readBlock(block) {
  const awards = [];
  const orphans = [];
  let list = null;

  const closeList = () => {
    if (list && list.winners.length > 0) awards.push(list);
    list = null;
  };

  block.lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const emojis = extractEmojis(trimmed);
    if (emojis.length > 0 && emojis[0].index === 0) {
      const winners = parseWinners(trimmed);
      if (list) list.winners.push(...winners);
      else orphans.push(...winners);
      return;
    }

    const head = trimmed.slice(0, emojis.length > 0 ? emojis[0].index : trimmed.length);
    const sep = head.match(LABEL_SEP_RE);
    if (!sep) return;
    const label = tidy(head.slice(0, sep.index));
    if (!label) return;

    const value = trimmed.slice(sep.index + sep[0].length);
    const winners = parseWinners(value);
    closeList();
    if (winners.length === 0) list = { name: label, winners: [] };
    else awards.push({ name: label, winners });
  });
  closeList();

  const raw = block.raw.join('\n').trim();
  if (awards.length === 0) {
    return { ok: false, error: `read a "Season ${block.seasonNumber} awards" heading but found no awards under it`, raw };
  }
  return { ok: true, kind: 'awards', seasonNumber: block.seasonNumber, awards, orphans, raw };
}

export function parseAwards(content) {
  const blocks = [];
  let current = null;
  String(content == null ? '' : content).split(/\r?\n/).forEach(line => {
    const header = tidy(withoutEmojis(line)).match(HEADER_RE);
    if (header) {
      current = { seasonNumber: Number(header[1]), lines: [], raw: [line] };
      blocks.push(current);
      return;
    }
    if (!current) return;
    current.lines.push(line);
    current.raw.push(line);
  });
  return blocks.map(readBlock);
}
