// Forwards a visitor's feedback-button submission to a Discord webhook.
// The webhook URL stays server-side (not NEXT_PUBLIC_*) so it's never
// exposed to the browser — this route is the only thing that ever calls it.
export const runtime = 'nodejs';

const MAX_LEN = 1800; // keeps well under Discord's 1024-char embed field limit after a little formatting overhead

export async function POST(request) {
  const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return Response.json({ error: 'Feedback isn\'t configured for this site yet.' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); } catch (e) { return Response.json({ error: 'Invalid request' }, { status: 400 }); }

  const message = String(body.message || '').trim().slice(0, MAX_LEN);
  const page = String(body.page || '').trim().slice(0, 200);
  const contact = String(body.contact || '').trim().slice(0, 200);
  if (!message) return Response.json({ error: 'Feedback message is required.' }, { status: 400 });

  const embed = {
    title: 'New site feedback',
    color: 0xf5c64b,
    description: message,
    fields: [
      ...(page ? [{ name: 'Page', value: page, inline: true }] : []),
      ...(contact ? [{ name: 'Contact', value: contact, inline: true }] : []),
    ],
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!res.ok) {
    return Response.json({ error: 'Could not deliver feedback right now.' }, { status: 502 });
  }
  return Response.json({ ok: true });
}
