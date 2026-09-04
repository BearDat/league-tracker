'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLeague, usePageTitle } from '../../../../lib/LeagueContext';
import NewsBlocks from '../../../../components/site/NewsBlocks';
import MediaGallery from '../../../../components/site/MediaGallery';
import { unplacedMedia } from '../../../../lib/domain/newsBlocks';
import { SectionHead, EmptyNote } from '../../../../components/site/primitives';

function postDate(at) {
  if (!at) return 'Undated';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(at));
}

export default function ArticlePage() {
  const { id } = useParams();
  const { snapshot } = useLeague();
  const post = snapshot ? (snapshot.news || []).find(n => n.id === id) : null;
  usePageTitle(post ? post.title : 'News');

  if (!snapshot) return <EmptyNote>No league data yet.</EmptyNote>;
  if (!post) return <EmptyNote>That article does not exist, or it was taken down.</EmptyNote>;

  const others = (snapshot.news || []).filter(n => n.id !== post.id).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 4);
  const leftover = unplacedMedia(post);

  return (
    <article>
      <Link href="/news" className="eyebrow text-ink-mute hover:text-brick">All news</Link>

      <header className="mt-2 mb-5">
        <h1 className="headline text-3xl sm:text-5xl leading-tight">{post.title}</h1>
        <p className="eyebrow text-ink-mute mt-2">
          {post.author ? `${post.author} · ` : ''}{postDate(post.at)}
        </p>
      </header>

      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt=""
          className="w-full max-h-[30rem] object-cover border border-rule mb-6"
        />
      )}

      <NewsBlocks post={post} />

      {leftover.length > 0 && (
        <section className="mt-8">
          <SectionHead title="More from this story" />
          <MediaGallery media={leftover} heroUrl={post.imageUrl} />
        </section>
      )}

      {others.length > 0 && (
        <section className="mt-10">
          <SectionHead title="More news" href="/news" linkLabel="All news" />
          <div className="card row-rule">
            {others.map(other => (
              <Link key={other.id} href={`/news/${other.id}`} className="flex items-baseline gap-3 px-3 py-2.5 hover:bg-paper-well">
                <span className="text-sm font-medium flex-1 min-w-0 truncate hover:text-brick">{other.title}</span>
                <span className="text-tiny text-ink-faint whitespace-nowrap">
                  {other.at ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(new Date(other.at)) : ''}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
