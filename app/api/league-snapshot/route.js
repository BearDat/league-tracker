import { getSnapshot } from '../../../lib/snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await getSnapshot();
  if (!snapshot) {
    return Response.json({ error: 'league unavailable' }, { status: 503 });
  }
  return Response.json(snapshot, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
