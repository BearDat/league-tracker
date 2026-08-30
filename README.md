# League Tracker

Public league website: standings, schedule, playoffs, stats, and odds, visible to
anyone. Only a logged-in admin can edit data (scores, teams, games, settings).

This is a migration of the original single-file `league-tracker.jsx` app (which stored
everything in browser-local storage) onto a real backend, plus login-gated editing. The
UI, standings math, playoff brackets, odds simulation, and theme system are unchanged.

## Stack

- **Frontend:** Next.js (App Router)
- **Backend:** Supabase (Postgres + Auth + Row Level Security)
- **Hosting:** Vercel

## 1. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run `supabase/schema.sql` from this repo. It creates a
   `kv_store` table (`key`, `value`, `updated_at`) with RLS policies: anyone can `select`,
   only authenticated users can `insert`/`update`/`delete`. It also creates an
   `admin_roles` table that drives the role tiers described below.
3. In **Authentication → Providers → Email**, make sure "Allow new users to sign up" is
   **off** — admin accounts are created manually, not through public sign-up.
4. In **Authentication → Users**, click **Add user** and create your own admin account.
   Admins log in with a **username**, not an email — Supabase Auth still needs an
   email-shaped value internally, so put `yourusername@admin.local` in the Email field
   (all lowercase). The app strips the `@admin.local` back off in the login form; nothing
   is ever sent to that address.
5. Copy the new user's **User UID** (shown in the Authentication → Users list), then run
   this once in the SQL editor to make that account the first Site Owner — after this,
   every other admin's role can be granted from the app itself (Settings → Manage admins):
   ```sql
   insert into admin_roles (user_id, username, role)
   values ('paste-the-user-uid-here', 'yourusername', 'site_owner');
   ```
6. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.

## 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_LEAGUE_ID=league_xxxxxxxx
```

The anon key is safe to expose client-side — it's the RLS policies above that actually
enforce who can write, not secrecy of this key.

`NEXT_PUBLIC_LEAGUE_ID` is the single league this site serves. Leave it unset for your
very first run: with no ID configured, the app falls back to the original multi-league
picker screen so you can log in and use the normal "New League" flow once to create your
league. After that, open the Supabase **Table Editor → kv_store** table and find the row
whose key is `leagues-index` — its JSON value contains your new league's `id` — and set
`NEXT_PUBLIC_LEAGUE_ID` to that value (redeploy/restart after setting it). From then on,
every visitor loads that one league directly on page load and the multi-league picker is
skipped entirely.

## 3. Run locally

```
npm install
npm run dev
```

Open http://localhost:3000. Log in with the Site Owner username from step 4/5 above
(top-right corner) to confirm edit controls appear and persist; log out (or open an
incognito window) to confirm the site is still fully browsable with editing controls
hidden/disabled.

## 4. Deploy

1. Push this repo to GitHub.
2. Import it in [Vercel](https://vercel.com/new).
3. Add the same three environment variables from step 2 in the Vercel project's
   **Settings → Environment Variables**.
4. Deploy. The live URL should behave identically to local testing.

## How the storage migration works

Every read/write in the original app went through exactly 7 functions defined near the
top of `components/LeagueTracker.jsx`: `storGet`, `storSet`, `storDelete`, `loadList`,
`saveList`, `loadObj`, `saveObj`. Only `storGet`/`storSet`/`storDelete` were reimplemented
to talk to the Supabase `kv_store` table instead of `window.storage`/`localStorage`; the
other four are thin wrappers around those three and are untouched, as are all ~48 call
sites elsewhere in the app.

## Auth gating

Write actions (save score, add/edit/delete team or game, appearance/settings changes,
etc.) are hidden or disabled unless `useAuth().isLoggedIn` is true. Every read stays
public regardless of login state, matching the original app's read paths.

## Admin roles

Every admin account is assigned one role in the `admin_roles` table, and the app shows or
hides edit controls based on it (`useAuth().hasPermission('someKey')`). This is
**UI-level enforcement only**: all admin accounts still share the same database write
access described above (RLS can't tell "post a news article" apart from "change the
playoff format" — both are just a write to the same `kv_store` table), so roles are about
keeping people out of parts of the interface they don't need, not a cryptographic
boundary. Treat every admin account as trusted, the same as before roles existed.

| Role | Can manage |
| --- | --- |
| Site Owner | Everything, including granting/revoking other admins' roles |
| Commissioner | Settings, seasons, rosters/trades/suspensions, schedule/scores, news, awards, league info |
| Board of Directors | League info (description, staff, links) — can view every other admin screen, but not edit it |
| Stat Mods | Schedule and scores, including box-score stat imports |
| Media | News posts |

**Granting a role:** create the account in Supabase (Authentication → Users → Add user,
per step 4 above), copy its User UID, then a Site Owner adds it from **Admin → Manage
admins** in the app itself. Changing or revoking a role works the same way.

**Migrating an existing email-login account to a username:** open Authentication → Users
in the Supabase dashboard, click the account, and edit its email to
`theirusername@admin.local`. Tell them their new username (whatever comes before the
`@admin.local`) — their password doesn't change. Do this for every existing admin account
before they next try to log in, since the login form now always appends `@admin.local`
itself.

## Discord bot

Three separate pieces, all optional and independent of each other:

- **Feedback button** (bottom-right of every page) — posts to a Discord webhook.
- **Admin action alerts** — every entry the app writes to its admin audit log (role
  changes, bans, forfeits, season create/delete, etc.) also posts to a Discord webhook.
- **Slash commands** (`/standings`, `/player`, `/compare`, `/leaders`, `/nextgame`,
  `/help`) — answered live from the same Supabase data the site itself reads, via
  Discord's HTTP Interactions API (no always-on bot process to host — it runs as an
  ordinary Vercel route, same as the rest of this app).

The two webhook-based pieces (feedback, admin alerts) don't need a bot at all — just a
webhook URL each. Slash commands need a real Discord Application/bot. All of the
following happens in Discord's own UI and dashboard, since that's tied to your Discord
account — nothing here can be scripted from outside it.

### 1. Feedback and admin-alert webhooks

A Discord webhook posts to exactly one channel — that's what makes "only send admin
alerts to one specific server" automatic: point the webhook at that one channel, in that
one server, and nothing else ever gets it, no matter how many other servers the bot (if
you set one up) is also sitting in.

1. In the Discord channel you want feedback to land in: **Channel Settings → Integrations
   → Webhooks → New Webhook**. Copy its **Webhook URL**.
2. Do the same in your admin server's specific channel for admin action alerts — a
   separate webhook, in a separate (or the same, your call) channel.
3. Set both as environment variables (`.env.local` for local dev, and the same names in
   Vercel's **Project Settings → Environment Variables** for production):
   ```
   DISCORD_FEEDBACK_WEBHOOK_URL=https://discord.com/api/webhooks/...
   DISCORD_ADMIN_WEBHOOK_URL=https://discord.com/api/webhooks/...
   ```
4. Deploy (or restart `npm run dev` locally). The feedback button and every audit-logged
   admin action now post automatically — nothing else to configure.

### 2. Slash-command bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) →
   **New Application**, name it (e.g. your league's name).
2. **General Information** tab: copy the **Application ID** (this is `DISCORD_CLIENT_ID`)
   and the **Public Key** (this is `DISCORD_PUBLIC_KEY`). Leave the **Interactions
   Endpoint URL** field blank for now — you'll come back to it after deploying, since
   Discord verifies that URL live and it has to actually be up first.
3. **Bot** tab → **Reset Token** (or **Add Bot** if this is a brand-new application) →
   copy the token (this is `DISCORD_BOT_TOKEN`). You won't be able to see it again after
   leaving the page — if you lose it, reset it and update the env var.
4. **OAuth2 → URL Generator**: check scopes **`bot`** and **`applications.commands`**.
   Under Bot Permissions, check **Send Messages**, **Embed Links**, and **Use Slash
   Commands**. Copy the generated URL at the bottom, open it, and invite the bot to
   whichever server(s) you want the commands available in — repeat for a second server if
   you want the bot in both a public and an admin server. (The `/standings`-style
   commands are meant to be public, so it's fine — even expected — to invite it into
   multiple servers; only the admin-alert webhook above is restricted to one channel.)
5. Set the three bot env vars, same as the webhooks above:
   ```
   DISCORD_BOT_TOKEN=...
   DISCORD_PUBLIC_KEY=...
   DISCORD_CLIENT_ID=...
   ```
6. Deploy to Vercel (or make sure it's already live) so `https://your-domain.vercel.app`
   is reachable.
7. Back in the Developer Portal's **General Information** tab, set **Interactions
   Endpoint URL** to:
   ```
   https://your-domain.vercel.app/api/discord-interactions
   ```
   Discord immediately sends a test request and only saves the field if it gets a valid
   signed response back — if this fails, double check `DISCORD_PUBLIC_KEY` is set in
   Vercel and that the deployment succeeded, then try saving again.
8. Register the slash commands with Discord — run this once (and again any time you add
   or change a command):
   ```
   node scripts/register-discord-commands.js
   ```
   Registered this way (no server id argument), commands are **global** and can take up
   to an hour to show up in Discord the first time. For instant testing in one server
   while you're setting this up, pass that server's id instead:
   ```
   node scripts/register-discord-commands.js YOUR_SERVER_ID
   ```
   (Right-click the server icon in Discord → Copy Server ID — you may need to enable
   **Settings → Advanced → Developer Mode** first to see that option.)
9. In Discord, type `/` in any channel the bot's in and try `/standings`, `/player`,
   `/compare`, `/leaders`, `/nextgame`, or `/help`.

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_LEAGUE_ID`
(already set up per the Supabase section above) are reused as-is for the bot's data
lookups — no separate database credentials needed.
