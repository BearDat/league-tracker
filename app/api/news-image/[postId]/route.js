import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const POST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATA_URI_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID;

function notFound() {
  return new Response('Not found', { status: 404 });
}

export async function GET(request, { params }) {
  const { postId } = await params;
  if (!POST_ID_RE.test(postId || '')) return notFound();
  if (!supabaseUrl || !supabaseAnonKey || !LEAGUE_ID) return notFound();

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from('kv_store')
    .select('value')
    .eq('key', `league:${LEAGUE_ID}`)
    .maybeSingle();
  if (error || !data) return notFound();

  let league;
  try {
    league = JSON.parse(data.value);
  } catch (e) {
    return notFound();
  }

  const post = (league.news || []).find(n => n.id === postId);
  if (!post || !post.imageUrl) return notFound();

  const match = String(post.imageUrl).match(DATA_URI_RE);
  if (!match) return Response.redirect(post.imageUrl, 307);

  const [, mime, base64] = match;
  const bytes = Buffer.from(base64, 'base64');
  const etag = `"${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}"`;

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new Response(bytes, {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      ETag: etag,
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=604800',
    },
  });
}
