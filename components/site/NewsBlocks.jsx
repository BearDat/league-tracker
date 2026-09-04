'use client';

import React from 'react';
import RichText from './RichText';
import { MediaItem } from './MediaGallery';
import { normalizeBlocks, mediaById } from '../../lib/domain/newsBlocks';

function Block({ block, post }) {
  if (block.type === 'heading') {
    return <h2 className="headline text-2xl sm:text-3xl mt-7 mb-2 first:mt-0"><RichText text={block.text} /></h2>;
  }
  if (block.type === 'subheading') {
    return <h3 className="headline text-xl mt-6 mb-2 first:mt-0"><RichText text={block.text} /></h3>;
  }
  if (block.type === 'lead') {
    return <p className="text-lg text-ink-soft leading-relaxed my-3"><RichText text={block.text} /></p>;
  }
  if (block.type === 'quote') {
    return (
      <blockquote className="border-l-2 border-brand pl-4 my-4 text-lg italic text-ink-soft">
        <RichText text={block.text} />
      </blockquote>
    );
  }
  if (block.type === 'list' || block.type === 'numbered') {
    const items = (block.items || []).filter(i => String(i).trim());
    if (items.length === 0) return null;
    const cls = 'my-3 pl-5 space-y-1 text-ink-soft';
    const children = items.map((item, i) => (
      <li key={i} className="text-base leading-relaxed"><RichText text={item} /></li>
    ));
    return block.type === 'numbered'
      ? <ol className={`${cls} list-decimal`}>{children}</ol>
      : <ul className={`${cls} list-disc`}>{children}</ul>;
  }
  if (block.type === 'media') {
    const item = mediaById(post, block.mediaId);
    if (!item) return null;
    return (
      <figure className="my-5">
        <MediaItem item={item} />
        {block.caption && <figcaption className="text-tiny text-ink-mute mt-1.5"><RichText text={block.caption} /></figcaption>}
      </figure>
    );
  }
  if (!String(block.text || '').trim()) return null;
  return <p className="text-base text-ink-soft leading-relaxed my-3"><RichText text={block.text} /></p>;
}

export default function NewsBlocks({ post }) {
  const blocks = normalizeBlocks(post);
  if (blocks.length === 0) return null;
  return (
    <div className="max-w-prose">
      {blocks.map(block => <Block key={block.id} block={block} post={post} />)}
    </div>
  );
}
