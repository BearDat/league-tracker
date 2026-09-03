'use client';

import React, { useState } from 'react';
import { useAdminLeague } from '../../lib/AdminLeagueContext';
import { addNewsPost, updateNewsPost, removeNewsPost } from '../../lib/domain/mutations';
import { EmptyNote } from '../site/primitives';

function when(at) {
  if (!at) return 'Undated';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(at));
}

function EditRow({ post, saving, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(post.title || '');
  const [body, setBody] = useState(post.body || '');
  const [author, setAuthor] = useState(post.author || '');

  if (!editing) {
    return (
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{post.title || 'Untitled'}</p>
          <p className="text-tiny text-ink-mute">
            {post.author ? `${post.author} · ` : ''}{when(post.at)}
            {post.imageUrl ? ' · has image' : ''}
          </p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="eyebrow text-ink-mute hover:text-brick">
          Edit
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => onRemove(post.id)}
          className="eyebrow text-loss hover:underline disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 space-y-2">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title"
        className="w-full bg-paper-well border border-rule px-2 py-1.5 text-sm" />
      <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author"
        className="w-full bg-paper-well border border-rule px-2 py-1.5 text-sm" />
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="Body"
        className="w-full bg-paper-well border border-rule px-2 py-1.5 text-sm resize-y" />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !title.trim()}
          onClick={async () => {
            const r = await onSave(post.id, { title: title.trim(), body, author: author.trim() });
            if (r && r.ok) setEditing(false);
          }}
          className="eyebrow bg-navy text-white px-3 py-2 disabled:opacity-40"
        >
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="eyebrow border border-rule px-3 py-2">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function NewsPanel() {
  const { league, mutate, saving } = useAdminLeague();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState('');

  if (!league) return <EmptyNote>No league is loaded.</EmptyNote>;
  const posts = [...(league.news || [])].sort((a, b) => (b.at || 0) - (a.at || 0));

  return (
    <div>
      <section className="card">
        <h2 className="headline text-lg px-3 py-2.5 border-b border-rule-strong">Write a post</h2>
        <div className="px-3 py-3 space-y-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title"
            className="w-full bg-paper-well border border-rule px-2 py-1.5 text-sm" />
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author (optional)"
            className="w-full bg-paper-well border border-rule px-2 py-1.5 text-sm" />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} placeholder="Body"
            className="w-full bg-paper-well border border-rule px-2 py-1.5 text-sm resize-y" />
          <button
            type="button"
            disabled={saving || !title.trim()}
            onClick={async () => {
              const r = await mutate(addNewsPost({ title, body, author }));
              if (r.ok) { setTitle(''); setBody(''); setAuthor(''); }
            }}
            className="eyebrow bg-navy text-white px-3 py-2 disabled:opacity-40"
          >
            Publish
          </button>
        </div>
      </section>

      <section className="card mt-6">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-rule-strong">
          <h2 className="headline text-lg">Posts</h2>
          <span className="eyebrow text-ink-mute">{posts.length}</span>
        </div>
        {posts.length === 0 ? (
          <EmptyNote>Nothing published yet.</EmptyNote>
        ) : (
          <div className="row-rule">
            {posts.map(post => (
              <EditRow
                key={post.id}
                post={post}
                saving={saving}
                onSave={(id, patch) => mutate(updateNewsPost(id, patch))}
                onRemove={id => mutate(removeNewsPost(id))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
