// Server-side proxy for hcbb.info's leaderboard API (it doesn't send CORS
// headers, so the browser can't call it directly). Scoped to the KPB league
// only (league code BE1E0C) — this route isn't a general hcbb.info proxy.
const KPB_LEAGUE = 'BE1E0C';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = (searchParams.get('season') || '').trim();
  if (!['1', '2', '3'].includes(season)) {
    return Response.json({ error: 'season must be 1, 2, or 3' }, { status: 400 });
  }
  try {
    const res = await fetch(`https://hcbb.info/api/leaderboard/?league=${KPB_LEAGUE}&season=${season}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return Response.json({ error: `hcbb.info returned ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    // Pass the unfiltered per-player totals straight through — the app's
    // own "Qualify" concept (min games/at-bats/IP) is applied client-side
    // when displaying leaders, never by dropping rows here, so this always
    // returns every player hcbb has a line for that season.
    return Response.json(data, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (e) {
    return Response.json({ error: 'hcbb.info lookup failed' }, { status: 502 });
  }
}
