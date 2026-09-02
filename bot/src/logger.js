const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

let threshold = LEVELS.info;

export function setLogLevel(level) {
  if (level in LEVELS) threshold = LEVELS[level];
}

function emit(level, msg, extra) {
  if (LEVELS[level] > threshold) return;
  const line = { t: new Date().toISOString(), level, msg };
  if (extra !== undefined) line.extra = extra;
  const out = level === 'error' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const log = {
  error: (msg, extra) => emit('error', msg, extra),
  warn: (msg, extra) => emit('warn', msg, extra),
  info: (msg, extra) => emit('info', msg, extra),
  debug: (msg, extra) => emit('debug', msg, extra),
};
