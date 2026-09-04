import { plainText } from './richtext.js';

export const BLOCK_TYPES = [
  { type: 'paragraph', label: 'Paragraph' },
  { type: 'heading', label: 'Heading', level: 2 },
  { type: 'subheading', label: 'Subheading', level: 3 },
  { type: 'lead', label: 'Large text' },
  { type: 'list', label: 'Bullet list' },
  { type: 'numbered', label: 'Numbered list' },
  { type: 'quote', label: 'Quote' },
];

export const TEXT_BLOCKS = ['paragraph', 'heading', 'subheading', 'lead', 'quote'];
export const LIST_BLOCKS = ['list', 'numbered'];

export function blockId() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newBlock(type) {
  if (LIST_BLOCKS.includes(type)) return { id: blockId(), type, items: [''] };
  if (type === 'media') return { id: blockId(), type, mediaId: null };
  return { id: blockId(), type, text: '' };
}

export function normalizeBlocks(post) {
  if (!post) return [];
  if (Array.isArray(post.blocks) && post.blocks.length > 0) return post.blocks;
  const legacy = String(post.body || '').trim();
  if (!legacy) return [];
  return legacy
    .split(/\n{2,}/)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map(chunk => ({ id: blockId(), type: 'paragraph', text: chunk }));
}

export function mediaById(post, mediaId) {
  return (post.media || []).find(m => m.id === mediaId) || null;
}

export function summaryOf(post, limit = 180) {
  if (post.summary && post.summary.trim()) return post.summary.trim();
  const blocks = normalizeBlocks(post);
  const prose = ['paragraph', 'lead', 'quote'];
  const hasText = b => String(b.text || '').trim();
  const first = blocks.find(b => prose.includes(b.type) && hasText(b))
    || blocks.find(b => TEXT_BLOCKS.includes(b.type) && hasText(b));
  const source = first ? plainText(first.text) : '';
  if (!source) return '';
  if (source.length <= limit) return source;
  const cut = source.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > 60 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function usedMediaIds(post) {
  return new Set(normalizeBlocks(post).filter(b => b.type === 'media' && b.mediaId).map(b => b.mediaId));
}

export function unplacedMedia(post) {
  const used = usedMediaIds(post);
  return (post.media || []).filter(m => !used.has(m.id) && m.url !== post.imageUrl);
}
