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
2. Open the SQL editor and run `supabase/schema.sql` from this repo. It creates a single
   `kv_store` table (`key`, `value`, `updated_at`) with RLS policies: anyone can `select`,
   only authenticated users can `insert`/`update`/`delete`.
3. In **Authentication → Providers → Email**, make sure "Allow new users to sign up" is
   **off** — admin accounts are created manually, not through public sign-up.
4. In **Authentication → Users**, click **Add user** and create your own admin account
   (email + password).
5. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.

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

Open http://localhost:3000. Log in with the admin account from step 1 (top-right corner)
to confirm edit controls appear and persist; log out (or open an incognito window) to
confirm the site is still fully browsable with editing controls hidden/disabled.

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
