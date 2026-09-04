'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { summaryOf } from '../../lib/domain/newsBlocks';
import { isRenderableEmbed } from '../../lib/media';
import { SectionHead } from './primitives';

const ROTATE_MS = 6000;

function postDate(at) {
  if (!at) return 'Undated';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'long', day: 'numeric',
  }).format(new Date(at));
}

function heroMedia(post) {
  if (post.imageUrl) return { kind: 'image', url: post.imageUrl };
  const first = (post.media || []).find(m => m.kind === 'image')
    || (post.media || []).find(m => m.kind === 'video' || isRenderableEmbed(m));
  return first || null;
}

function Slide({ post, active }) {
  const media = heroMedia(post);
  const summary = summaryOf(post, 160);
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-700 ease-out ${
        active ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!active}
    >
      {media && media.kind === 'image' && (
        <img src={media.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {media && media.kind === 'video' && (
        <video src={media.url} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {!media && <div className="absolute inset-0 bg-navy" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <p className="eyebrow text-white/70">{post.author ? `${post.author} · ` : ''}{postDate(post.at)}</p>
        <Link href={`/news/${post.id}`} className="headline text-white text-2xl sm:text-4xl leading-tight block mt-1 hover:underline">
          {post.title}
        </Link>
        {summary && <p className="text-sm text-white/80 mt-2 max-w-2xl line-clamp-2">{summary}</p>}
        <Link href={`/news/${post.id}`} className="eyebrow text-white/90 hover:text-white inline-block mt-2.5 underline underline-offset-4">
          Read more
        </Link>
      </div>
    </div>
  );
}

export default function NewsCarousel({ posts }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = posts.length;
  const timer = useRef(null);

  const go = useCallback((next) => {
    setIndex(((next % count) + count) % count);
  }, [count]);

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    timer.current = setInterval(() => setIndex(i => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(timer.current);
  }, [count, paused, index]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) setPaused(true);
  }, []);

  if (count === 0) return null;

  return (
    <section className="mb-8">
      <SectionHead title="Latest news" href="/news" linkLabel="All news" />
      <div
        className="relative overflow-hidden border border-rule bg-paper-sunk h-72 sm:h-96"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {posts.map((post, i) => <Slide key={post.id} post={post} active={i === index} />)}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous story"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/45 text-white hover:bg-black/70 transition-colors"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next story"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/45 text-white hover:bg-black/70 transition-colors"
            >
              ›
            </button>
            <div className="absolute top-3 right-3 flex gap-1.5">
              {posts.map((post, i) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Story ${i + 1}`}
                  aria-current={i === index}
                  className={`h-1.5 transition-all ${i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
