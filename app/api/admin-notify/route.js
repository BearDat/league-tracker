// Forwards one admin-audit-log entry to a Discord webhook pointed at a
// single specific channel in the admin server. A webhook URL is inherently
// bound to exactly one channel (and therefore exactly one server) when it's
// created in Discord — so if the bot is invited into more than one server,
// this still only ever posts to the one channel this URL was made for,
// with no "which server" logic needed on this end at all.
export const runtime = 'nodejs';

export async function POST(request) {
  const webhookUrl = process.env.DISCORD_ADMIN_WEBHOOK_URL;
  if (!webhookUrl) return Response.json({ error: 'Admin notifications aren\'t configured.' }, { status: 503 });

  let body;
  try { body = await request.json(); } catch (e) { return Response.json({ error: 'Invalid request' }, { status: 400 }); }

  const action = String(body.action || '').trim().slice(0, 200);
  const detail = String(body.detail || '').trim().slice(0, 1000);
  if (!action) return Response.json({ error: 'Missing action' }, { status: 400 });

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: action,
        description: detail || undefined,
        color: 0xf5c64b,
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  if (!res.ok) return Response.json({ error: 'Could not deliver notification.' }, { status: 502 });
  return Response.json({ ok: true });
}
