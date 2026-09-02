import { readFileSync } from 'node:fs';
import { parseForChannel, PARSERS } from './parsers/index.js';

const args = process.argv.slice(2);
const resolveFlag = args.includes('--resolve');
const positional = args.filter(a => !a.startsWith('--'));
const kind = positional[0];
const file = positional[1];

if (!kind || !PARSERS[kind]) {
  console.error(`usage: node src/dryrun.js <${Object.keys(PARSERS).join('|')}> [file] [--resolve]`);
  console.error('reads stdin when no file is given');
  process.exit(1);
}

function readInput() {
  if (file) return readFileSync(file, 'utf8');
  try {
    return readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

const content = readInput();
if (!content.trim()) {
  console.error('no input');
  process.exit(1);
}

const rows = parseForChannel(kind, content);

if (!resolveFlag) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const { buildContext } = await import('./handlers.js');
const { resolveParsed } = await import('./resolve/index.js');

const ctx = await buildContext({ learn: false });
const out = [];
for (const parsed of rows) {
  const resolved = await resolveParsed(parsed, ctx);
  out.push({
    kind: resolved.kind,
    confidence: resolved.confidence,
    reasons: resolved.reasons,
    display: resolved.display,
    item: resolved.item,
  });
}
console.log(JSON.stringify(out, null, 2));
process.exit(0);
