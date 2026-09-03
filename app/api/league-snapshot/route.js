import { getSnapshot } from '../../../lib/snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  const snapshot = await getSnapshot({ force: fresh });
  if (!snapshot) {
    return Response.json({ error: 'league unavailable' }, { status: 503 });
  }
  return Response.json(snapshot, {
    headers: {
      'Cache-Control': fresh ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
