'use client';

import React from 'react';
import Link from 'next/link';
import { SectionHead, cleanDiscordText } from './primitives';

function postDate(at) {
  if (!at) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'long', day: 'numeric',
  }).format(new Date(at));
}

export default function NewsHero({ posts }) {
  if (!posts || posts.length === 0) return null;
  const [lead, ...rest] = posts;

  return (
    <section className="mb-8">
      <SectionHead title="Latest news" href="/news" linkLabel="All news" />
      <article className="card overflow-hidden animate-fade-up">
        {lead.imageUrl && (
          <Link href="/news" className="block">
            <img
              src={lead.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full max-h-80 object-cover border-b border-rule"
            />
          </Link>
        )}
        <div className="p-4">
          <Link href="/news" className="headline text-2xl sm:text-3xl leading-tight hover:text-brick">
            {lead.title}
          </Link>
          <p className="eyebrow text-ink-mute mt-1.5">
            {lead.author ? `${lead.author} · ` : ''}{postDate(lead.at) || 'Undated'}
          </p>
          {lead.body && (
            <p className="text-sm text-ink-soft whitespace-pre-line mt-2.5">{cleanDiscordText(lead.body)}</p>
          )}
        </div>
      </article>

      {rest.length > 0 && (
        <div className="card row-rule mt-px">
          {rest.map(post => (
            <Link key={post.id} href="/news" className="flex items-baseline gap-3 px-3 py-2.5 hover:bg-paper-well">
              <span className="text-sm font-medium flex-1 min-w-0 truncate hover:text-brick">{post.title}</span>
              <span className="text-tiny text-ink-faint whitespace-nowrap">{postDate(post.at)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
