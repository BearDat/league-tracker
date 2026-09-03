'use client';

import React from 'react';
import { useLeague, usePageTitle } from '../../../lib/LeagueContext';
import { SectionHead, EmptyNote, cleanDiscordText } from '../../../components/site/primitives';

function postDate(at) {
  if (!at) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(at));
}

export default function NewsPage() {
  usePageTitle('News');
  const { snapshot } = useLeague();
  if (!snapshot) return <EmptyNote>No league data yet.</EmptyNote>;
  const posts = [...(snapshot.news || [])].sort((a, b) => (b.at || 0) - (a.at || 0));

  return (
    <div>
      <SectionHead title="News">
        <span className="eyebrow text-ink-mute pb-0.5">
          {posts.length} {posts.length === 1 ? 'post' : 'posts'}
        </span>
      </SectionHead>

      {posts.length === 0 ? (
        <EmptyNote>Nothing has been posted yet.</EmptyNote>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 stagger">
          {posts.map(post => (
            <article key={post.id} className="card overflow-hidden animate-fade-up flex flex-col">
              {post.imageUrl && (
                <img
                  src={post.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full max-h-64 object-cover border-b border-rule"
                />
              )}
              <div className="p-4 flex-1">
                <h2 className="headline text-2xl leading-tight">{post.title}</h2>
                <p className="eyebrow text-ink-mute mt-1">
                  {post.author ? `${post.author} · ` : ''}{postDate(post.at) || 'Undated'}
                </p>
                {post.body && (
                  <p className="text-sm text-ink-soft whitespace-pre-line mt-3">{cleanDiscordText(post.body)}</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
