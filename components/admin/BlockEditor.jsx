'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MARKS, wrapSelection } from '../../lib/domain/richtext';
import { BLOCK_TYPES, LIST_BLOCKS, TEXT_BLOCKS, newBlock, normalizeBlocks } from '../../lib/domain/newsBlocks';
import { MediaItem } from '../site/MediaGallery';

function Toolbar({ targetRef, value, onChange }) {
  const apply = (wrap) => {
    const el = targetRef.current;
    if (!el) return;
    const next = wrapSelection(value, el.selectionStart, el.selectionEnd, wrap);
    if (!next) return;
    onChange(next.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  };
  const link = () => {
    const el = targetRef.current;
    if (!el) return;
    const selected = value.slice(el.selectionStart, el.selectionEnd);
    if (!selected) return;
    const href = prompt('Link to which URL?');
    if (!href || !/^https?:\/\//i.test(href)) return;
    const next = `${value.slice(0, el.selectionStart)}[${selected}](${href})${value.slice(el.selectionEnd)}`;
    onChange(next);
  };
  return (
    <div className="flex items-center gap-1">
      {MARKS.map(mark => (
        <button
          key={mark.key}
          type="button"
          title={mark.title}
          onMouseDown={e => e.preventDefault()}
          onClick={() => apply(mark.wrap)}
          className={`w-7 h-7 border border-rule bg-paper text-sm hover:border-brick ${
            mark.key === 'bold' ? 'font-bold' : mark.key === 'italic' ? 'italic' : 'underline'
          }`}
        >
          {mark.label}
        </button>
      ))}
      <button
        type="button"
        title="Link"
        onMouseDown={e => e.preventDefault()}
        onClick={link}
        className="h-7 px-2 border border-rule bg-paper text-tiny hover:border-brick"
      >
        Link
      </button>
    </div>
  );
}

function TextBlock({ block, onPatch }) {
  const ref = useRef(null);
  const rows = block.type === 'paragraph' || block.type === 'lead' ? 4 : 2;
  return (
    <div>
      <Toolbar targetRef={ref} value={block.text || ''} onChange={text => onPatch({ text })} />
      <textarea
        ref={ref}
        value={block.text || ''}
        onChange={e => onPatch({ text: e.target.value })}
        rows={rows}
        placeholder={block.type === 'quote' ? 'Quote' : 'Text'}
        className="mt-1.5 w-full bg-paper-well border border-rule px-2 py-1.5 text-sm resize-y"
      />
    </div>
  );
}

function ListBlock({ block, onPatch }) {
  const items = block.items || [''];
  const set = (i, value) => onPatch({ items: items.map((v, n) => (n === i ? value : v)) });
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-ink-faint text-sm w-4">{block.type === 'numbered' ? `${i + 1}.` : '•'}</span>
          <input
            value={item}
            onChange={e => set(i, e.target.value)}
            placeholder="List item"
            className="flex-1 bg-paper-well border border-rule px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => onPatch({ items: items.filter((_, n) => n !== i) })}
            className="eyebrow text-loss hover:underline"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onPatch({ items: [...items, ''] })}
        className="eyebrow border border-rule px-2 py-1"
      >
        Add item
      </button>
    </div>
  );
}

function MediaBlock({ block, post, onPatch }) {
  const item = (post.media || []).find(m => m.id === block.mediaId) || null;
  return (
    <div>
      <select
        value={block.mediaId || ''}
        onChange={e => onPatch({ mediaId: e.target.value || null })}
        className="w-full bg-paper-well border border-rule px-2 py-1.5 text-sm"
      >
        <option value="">Choose an uploaded file or link…</option>
        {(post.media || []).map(m => (
          <option key={m.id} value={m.id}>{m.name || m.url} ({m.kind})</option>
        ))}
      </select>
      {item && <div className="mt-2"><MediaItem item={item} /></div>}
      <input
        value={block.caption || ''}
        onChange={e => onPatch({ caption: e.target.value })}
        placeholder="Caption (optional)"
        className="mt-2 w-full bg-paper-well border border-rule px-2 py-1.5 text-sm"
      />
    </div>
  );
}

export default function BlockEditor({ post, saving, onSave }) {
  const [blocks, setBlocks] = useState(() => normalizeBlocks(post));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setBlocks(normalizeBlocks(post));
  }, [post, dirty]);

  const update = (next) => { setBlocks(next); setDirty(true); };
  const patch = (id, fields) => update(blocks.map(b => (b.id === id ? { ...b, ...fields } : b)));
  const move = (i, delta) => {
    const to = i + delta;
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[to]] = [next[to], next[i]];
    update(next);
  };
  const insert = (type) => update([...blocks, newBlock(type)]);

  return (
    <div className="border-t border-rule px-3 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="eyebrow text-ink-mute">Article body</span>
        <div className="flex items-center gap-2">
          {dirty && <span className="eyebrow text-brick">Unsaved</span>}
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={async () => {
              const cleaned = blocks.filter(b => (
                b.type === 'media' ? b.mediaId
                  : LIST_BLOCKS.includes(b.type) ? (b.items || []).some(i => String(i).trim())
                    : String(b.text || '').trim()
              ));
              const result = await onSave(cleaned);
              if (result && result.ok) { setDirty(false); setBlocks(cleaned); }
            }}
            className="eyebrow bg-navy text-white px-3 py-1.5 disabled:opacity-40"
          >
            Save body
          </button>
        </div>
      </div>

      <div className="space-y-3 mt-3">
        {blocks.length === 0 && (
          <p className="text-tiny text-ink-faint">Empty. Add a block below.</p>
        )}
        {blocks.map((block, i) => (
          <div key={block.id} className="border border-rule bg-paper p-2.5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <select
                value={block.type}
                onChange={e => {
                  const type = e.target.value;
                  const base = newBlock(type);
                  const carried = LIST_BLOCKS.includes(type)
                    ? { items: LIST_BLOCKS.includes(block.type) ? block.items : [block.text || ''] }
                    : TEXT_BLOCKS.includes(type)
                      ? { text: LIST_BLOCKS.includes(block.type) ? (block.items || []).join(' ') : (block.text || '') }
                      : {};
                  patch(block.id, { ...base, id: block.id, type, ...carried });
                }}
                className="bg-paper-well border border-rule px-2 py-1 text-tiny"
              >
                {[...BLOCK_TYPES, { type: 'media', label: 'Image / video' }].map(t => (
                  <option key={t.type} value={t.type}>{t.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  className="w-7 h-7 border border-rule bg-paper disabled:opacity-30" aria-label="Move up">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}
                  className="w-7 h-7 border border-rule bg-paper disabled:opacity-30" aria-label="Move down">↓</button>
                <button type="button" onClick={() => update(blocks.filter(b => b.id !== block.id))}
                  className="eyebrow text-loss hover:underline px-1">Remove</button>
              </div>
            </div>

            {block.type === 'media'
              ? <MediaBlock block={block} post={post} onPatch={f => patch(block.id, f)} />
              : LIST_BLOCKS.includes(block.type)
                ? <ListBlock block={block} onPatch={f => patch(block.id, f)} />
                : <TextBlock block={block} onPatch={f => patch(block.id, f)} />}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <span className="eyebrow text-ink-faint mr-1">Add</span>
        {[...BLOCK_TYPES, { type: 'media', label: 'Image / video' }].map(t => (
          <button
            key={t.type}
            type="button"
            onClick={() => insert(t.type)}
            className="eyebrow border border-rule bg-paper px-2 py-1 hover:border-brick"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
