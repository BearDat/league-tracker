// Server-side proxy for Roblox's avatar lookup. Roblox's user/thumbnail APIs
// don't send CORS headers for browser callers, so this has to happen on the
// server — the client just hits /api/roblox-avatar?username=X. No API key:
// these Roblox endpoints are public and unauthenticated.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = (searchParams.get('username') || '').trim();
  if (!username) {
    return Response.json({ error: 'Missing username' }, { status: 400 });
  }

  try {
    const userRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
    });
    if (!userRes.ok) {
      return Response.json({ error: 'Roblox user lookup failed' }, { status: 502 });
    }
    const userData = await userRes.json();
    const user = userData.data && userData.data[0];
    if (!user) {
      return Response.json({ error: 'No Roblox user with that username' }, { status: 404 });
    }

    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`);
    if (!thumbRes.ok) {
      return Response.json({ error: 'Roblox thumbnail lookup failed' }, { status: 502 });
    }
    const thumbData = await thumbRes.json();
    const thumb = thumbData.data && thumbData.data[0];
    if (!thumb || !thumb.imageUrl) {
      return Response.json({ error: 'No avatar image available' }, { status: 404 });
    }

    return Response.json(
      { userId: user.id, avatarUrl: thumb.imageUrl },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
  } catch (e) {
    return Response.json({ error: 'Roblox lookup failed' }, { status: 502 });
  }
}
