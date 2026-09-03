'use client';

import { supabase } from './supabaseClient';
import { MEDIA_BUCKET, MAX_UPLOAD_BYTES, mediaKindOf, formatBytes } from './media';

function safeName(name) {
  return String(name || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80) || 'file';
}

function storagePath(postId, file) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `news/${postId}/${stamp}-${rand}-${safeName(file.name)}`;
}

export async function uploadNewsMedia(postId, file) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
  }
  const path = storagePath(postId, file);
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) {
    if (/row-level security|policy/i.test(error.message)) {
      throw new Error('Storage rejected the upload. Run supabase/storage.sql once in the SQL editor to add the media policies.');
    }
    if (/bucket not found/i.test(error.message)) {
      throw new Error('The "media" bucket does not exist yet. Run supabase/storage.sql once in the SQL editor.');
    }
    if (/mime type|maximum allowed size|exceeded/i.test(error.message)) {
      throw new Error(error.message);
    }
    throw error;
  }
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return {
    id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind: mediaKindOf(file.type),
    provider: 'upload',
    url: data.publicUrl,
    path,
    name: file.name,
    contentType: file.type || null,
    size: file.size,
    at: Date.now(),
  };
}

export async function deleteStoredMedia(item) {
  if (!item || item.provider !== 'upload' || !item.path) return;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([item.path]);
  if (error) throw error;
}
