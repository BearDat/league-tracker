const TOKEN = /(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;

export const MARKS = [
  { key: 'bold', label: 'B', wrap: '**', title: 'Bold' },
  { key: 'italic', label: 'I', wrap: '*', title: 'Italic' },
  { key: 'underline', label: 'U', wrap: '__', title: 'Underline' },
];

export function parseInline(text) {
  const source = String(text == null ? '' : text);
  const out = [];
  let last = 0;
  const re = new RegExp(TOKEN.source, 'g');
  let m = re.exec(source);
  while (m) {
    if (m.index > last) out.push({ type: 'text', value: source.slice(last, m.index) });
    if (m[1]) out.push({ type: 'bold', value: m[1].slice(2, -2) });
    else if (m[2]) out.push({ type: 'underline', value: m[2].slice(2, -2) });
    else if (m[3]) out.push({ type: 'italic', value: m[3].slice(1, -1) });
    else if (m[4]) {
      const label = m[4].slice(1, m[4].indexOf(']'));
      out.push({ type: 'link', value: label, href: m[5] });
    }
    last = m.index + m[0].length;
    m = re.exec(source);
  }
  if (last < source.length) out.push({ type: 'text', value: source.slice(last) });
  return out;
}

export function plainText(text) {
  return parseInline(text).map(t => t.value).join('');
}

export function wrapSelection(value, start, end, wrap) {
  const selected = value.slice(start, end);
  if (!selected) return null;
  const w = wrap.length;

  if (selected.startsWith(wrap) && selected.endsWith(wrap) && selected.length > w * 2) {
    return {
      value: value.slice(0, start) + selected.slice(w, -w) + value.slice(end),
      start,
      end: end - w * 2,
    };
  }

  const wrappedOutside = value.slice(Math.max(0, start - w), start) === wrap
    && value.slice(end, end + w) === wrap;
  if (wrappedOutside) {
    return {
      value: value.slice(0, start - w) + selected + value.slice(end + w),
      start: start - w,
      end: end - w,
    };
  }

  return {
    value: `${value.slice(0, start)}${wrap}${selected}${wrap}${value.slice(end)}`,
    start: start + w,
    end: end + w,
  };
}
