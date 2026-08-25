// Server-side proxy for Roblox's avatar lookup. Roblox's user/thumbnail APIs
// don't send CORS headers for browser callers, so this has to happen on the
// server — the client just hits /api/roblox-avatar?username=X (or, once a
// player's Roblox account id is known, ?userId=X — the preferred mode, since
// it works even after the account has since changed its username, and lets
// the response's resolved username be compared against the stored name to
// detect that a rename happened). No API key: these Roblox endpoints are
// public and unauthenticated.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = (searchParams.get('username') || '').trim();
  const userIdParam = (searchParams.get('userId') || '').trim();

  try {
    let userId, resolvedUsername;
    if (userIdParam) {
      const userRes = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(userIdParam)}`);
      if (!userRes.ok) {
        return Response.json({ error: 'Roblox user lookup failed' }, { status: 502 });
      }
      const user = await userRes.json();
      if (!user || !user.id) {
        return Response.json({ error: 'No Roblox user with that id' }, { status: 404 });
      }
      userId = user.id; resolvedUsername = user.name;
    } else if (username) {
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
      userId = user.id; resolvedUsername = user.name;
    } else {
      return Response.json({ error: 'Missing username or userId' }, { status: 400 });
    }

    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`);
    if (!thumbRes.ok) {
      return Response.json({ error: 'Roblox thumbnail lookup failed' }, { status: 502 });
    }
    const thumbData = await thumbRes.json();
    const thumb = thumbData.data && thumbData.data[0];
    if (!thumb || !thumb.imageUrl) {
      return Response.json({ error: 'No avatar image available' }, { status: 404 });
    }

    return Response.json(
      { userId, username: resolvedUsername, avatarUrl: thumb.imageUrl },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
  } catch (e) {
    return Response.json({ error: 'Roblox lookup failed' }, { status: 502 });
  }
}
