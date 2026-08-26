// Server-side proxy for Roblox's username history API (same CORS problem as
// /api/roblox-avatar — Roblox doesn't send CORS headers for browser
// callers). Given a Roblox account id, returns every past username Roblox
// has on record for it, oldest first. Paginated on Roblox's end; this walks
// every page (capped, in case an account has an unreasonably long history)
// and flattens it into one array. No API key: this endpoint is public and
// unauthenticated.
const MAX_PAGES = 10;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get('userId') || '').trim();
  if (!/^\d+$/.test(userId)) {
    return Response.json({ error: 'userId must be a Roblox account id (a positive integer)' }, { status: 400 });
  }
  try {
    const usernames = [];
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `https://users.roblox.com/v1/users/${encodeURIComponent(userId)}/username-history?limit=100&sortOrder=Asc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        // First page failing means the lookup itself failed; a later page
        // failing just means stop where we got to rather than losing what
        // was already fetched.
        if (page === 0) return Response.json({ error: `Roblox username history lookup failed (${res.status})` }, { status: 502 });
        break;
      }
      const data = await res.json();
      (data.data || []).forEach(row => { if (row && row.name) usernames.push(row.name); });
      if (!data.nextPageCursor) break;
      cursor = data.nextPageCursor;
    }
    return Response.json({ userId, usernames }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch (e) {
    return Response.json({ error: 'Roblox username history lookup failed' }, { status: 502 });
  }
}
