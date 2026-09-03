export const MEDIA_BUCKET = 'media';
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const ACCEPTED_UPLOAD = 'image/png,image/jpeg,image/gif,image/webp,image/avif,video/mp4,video/webm,video/quicktime';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

const YOUTUBE = [
  /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{6,})/i,
  /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{6,})/i,
  /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i,
];
const STREAMABLE = /^https?:\/\/(?:www\.)?streamable\.com\/(?:e\/)?([A-Za-z0-9]+)/i;

export function classifyLink(raw) {
  const url = String(raw || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;

  for (const re of YOUTUBE) {
    const m = url.match(re);
    if (m) return { kind: 'embed', provider: 'youtube', url, embedUrl: `https://www.youtube.com/embed/${m[1]}` };
  }
  const s = url.match(STREAMABLE);
  if (s) return { kind: 'embed', provider: 'streamable', url, embedUrl: `https://streamable.com/e/${s[1]}` };

  if (VIDEO_EXT.test(url)) return { kind: 'video', provider: 'link', url };
  if (IMAGE_EXT.test(url)) return { kind: 'image', provider: 'link', url };
  return { kind: 'link', provider: 'link', url };
}

export function mediaKindOf(contentType) {
  if (!contentType) return 'link';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  return 'link';
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function isRenderableEmbed(item) {
  return item && item.kind === 'embed' && !!item.embedUrl
    && (item.provider === 'youtube' || item.provider === 'streamable');
}
