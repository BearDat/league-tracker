import { extractEmojis, splitHeadAndGroups, stripEmojis, contentLines } from './util.js';

const SUSPEND_RE = /^(.*?)\s+suspended\s+(?:for\s+)?(indefinitely|\d+)\s*(?:games?)?\s*\.?\s*$/i;
const BAN_RE = /^(.*?)\s+(?:is\s+)?banned(?:\s+from\s+[^.]*)?\.?\s*$/i;
const UNBAN_RE = /^(.*?)\s+(?:unbanned|ban\s+lifted|ban\s+revoked)\b.*$/i;
const UNSUSPEND_RE = /^(.*?)\s+(?:unsuspended|suspension\s+lifted|suspension\s+revoked)\b.*$/i;

function cleanName(raw) {
  return stripEmojis(raw).replace(/\s+/g, ' ').trim();
}

export function parseSuspensionLine(line) {
  const { head, groups } = splitHeadAndGroups(line);
  const emojis = extractEmojis(head);
  const reason = groups.length > 0 ? groups[0].text.trim() : '';

  const unban = head.match(UNBAN_RE);
  if (unban) {
    const name = cleanName(unban[1]);
    if (!name) return { ok: false, error: 'no player name found', raw: line };
    return { ok: true, kind: 'unban', emojiId: emojis[0] ? emojis[0].id : null, emojiName: emojis[0] ? emojis[0].name : null, player: name, reason, raw: line };
  }

  const unsuspend = head.match(UNSUSPEND_RE);
  if (unsuspend) {
    const name = cleanName(unsuspend[1]);
    if (!name) return { ok: false, error: 'no player name found', raw: line };
    return { ok: true, kind: 'unsuspend', emojiId: emojis[0] ? emojis[0].id : null, emojiName: emojis[0] ? emojis[0].name : null, player: name, reason, raw: line };
  }

  const suspend = head.match(SUSPEND_RE);
  if (suspend) {
    const name = cleanName(suspend[1]);
    if (!name) return { ok: false, error: 'no player name found', raw: line };
    const durationRaw = suspend[2];
    const indefinite = /indefinitely/i.test(durationRaw);
    return {
      ok: true,
      kind: 'suspend',
      emojiId: emojis[0] ? emojis[0].id : null,
      emojiName: emojis[0] ? emojis[0].name : null,
      player: name,
      games: indefinite ? null : Number(durationRaw),
      indefinite,
      reason,
      raw: line,
    };
  }

  const ban = head.match(BAN_RE);
  if (ban) {
    const name = cleanName(ban[1]);
    if (!name) return { ok: false, error: 'no player name found', raw: line };
    return { ok: true, kind: 'ban', emojiId: emojis[0] ? emojis[0].id : null, emojiName: emojis[0] ? emojis[0].name : null, player: name, reason, raw: line };
  }

  return { ok: false, error: 'not a suspension or ban line', raw: line };
}

export function parseSuspensions(content) {
  return contentLines(content).map(parseSuspensionLine);
}
