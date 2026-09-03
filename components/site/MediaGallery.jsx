'use client';

import React from 'react';
import { isRenderableEmbed } from '../../lib/media';

function Frame({ children, label }) {
  return (
    <figure className="bg-paper-sunk border border-rule overflow-hidden">
      {children}
      {label && <figcaption className="text-tiny text-ink-faint px-2 py-1.5 truncate">{label}</figcaption>}
    </figure>
  );
}

export function MediaItem({ item }) {
  if (!item || !item.url) return null;

  if (item.kind === 'image') {
    return (
      <Frame label={item.name}>
        <img src={item.url} alt="" loading="lazy" decoding="async" className="w-full object-contain max-h-[28rem]" />
      </Frame>
    );
  }

  if (item.kind === 'video') {
    return (
      <Frame label={item.name}>
        <video
          src={item.url}
          controls
          preload="metadata"
          playsInline
          className="w-full max-h-[28rem] bg-black"
        />
      </Frame>
    );
  }

  if (isRenderableEmbed(item)) {
    return (
      <Frame label={item.name}>
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <iframe
            src={item.embedUrl}
            title={item.name || 'Highlight'}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>
      </Frame>
    );
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-paper-sunk border border-rule px-3 py-2.5 text-sm hover:border-brick"
    >
      <span className="eyebrow text-ink-mute">Link</span>
      <span className="block truncate text-brick">{item.name || item.url}</span>
    </a>
  );
}

export default function MediaGallery({ media, heroUrl }) {
  const items = (media || []).filter(m => m && m.url && m.url !== heroUrl);
  if (items.length === 0) return null;
  const columns = items.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2';
  return (
    <div className={`grid ${columns} gap-3 mt-4`}>
      {items.map(item => <MediaItem key={item.id || item.url} item={item} />)}
    </div>
  );
}
