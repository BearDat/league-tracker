export const EMOJI_RE = /<(a?):([A-Za-z0-9_~]+):(\d+)>/g;

export function extractEmojis(text) {
  const out = [];
  const re = new RegExp(EMOJI_RE.source, 'g');
  let m = re.exec(text);
  while (m) {
    out.push({ animated: m[1] === 'a', name: m[2], id: m[3], index: m.index, raw: m[0] });
    m = re.exec(text);
  }
  return out;
}

export function stripEmojis(text) {
  return text.replace(new RegExp(EMOJI_RE.source, 'g'), ' ');
}

export function splitHeadAndGroups(line) {
  const groups = [];
  let depth = 0;
  let start = -1;
  let headEnd = line.length;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '(') {
      if (depth === 0) {
        start = i;
        if (headEnd === line.length) headEnd = i;
      }
      depth += 1;
    } else if (ch === ')') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          groups.push({ text: line.slice(start + 1, i), start, end: i });
          start = -1;
        }
      }
    }
  }
  if (depth > 0 && start >= 0) {
    groups.push({ text: line.slice(start + 1), start, end: line.length });
  }
  return { head: line.slice(0, headEnd).trim(), groups };
}

export function trailingGroups(text) {
  const groups = [];
  let rest = text.trimEnd();
  for (;;) {
    if (!rest.endsWith(')')) break;
    let depth = 0;
    let openAt = -1;
    for (let i = rest.length - 1; i >= 0; i -= 1) {
      if (rest[i] === ')') depth += 1;
      else if (rest[i] === '(') {
        depth -= 1;
        if (depth === 0) {
          openAt = i;
          break;
        }
      }
    }
    if (openAt < 0) break;
    groups.unshift(rest.slice(openAt + 1, rest.length - 1).trim());
    rest = rest.slice(0, openAt).trimEnd();
  }
  return { rest, groups };
}

const STAR_STRIP = /[★☆⭐️]/g;
const STAR_MARK = /[★☆⭐]|\bstars?\b/i;

export function classifyGroup(raw) {
  const text = String(raw == null ? '' : raw).trim();
  const cap = text.match(/^([\d]+(?:\.\d+)?)\s*\/\s*([\d]+(?:\.\d+)?)$/);
  if (cap) {
    return { kind: 'cap', used: parseFloat(cap[1]), max: parseFloat(cap[2]) };
  }
  if (/^r$/i.test(text)) return { kind: 'rating', starLevel: null, rookie: true };
  const starless = text.replace(STAR_STRIP, '').replace(/\bstars?\b/i, '').trim();
  if (STAR_MARK.test(text) && /^\d+(?:\.\d+)?$/.test(starless)) {
    return { kind: 'rating', starLevel: parseFloat(starless), rookie: false };
  }
  return { kind: 'note', text };
}

export function parseNameList(text) {
  return String(text == null ? '' : text)
    .split(/\s*,\s*|\s+and\s+/i)
    .map(s => s.trim())
    .filter(Boolean);
}

export function normalizeName(name) {
  return String(name == null ? '' : name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function contentLines(content) {
  return String(content == null ? '' : content)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
}

const ET_ZONE = 'America/New_York';

function tzOffsetMs(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find(p => p.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - utcMs;
}

export function easternToUtcMs(year, month, day, hour, minute) {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = naive;
  for (let i = 0; i < 3; i += 1) {
    guess = naive - tzOffsetMs(guess, ET_ZONE);
  }
  return guess;
}

export function easternPartsNow(nowMs = Date.now()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(nowMs));
  const get = (type) => Number(parts.find(p => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}
