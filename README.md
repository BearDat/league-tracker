super awesome thing idk

## How the site loads data

The whole league is one ~1.6 MB JSON blob in `kv_store`, and each `team:` row
carries its logo as a base64 data URI, so the pages used to spend 0.5–1.2s on
Supabase reads *per navigation*. Every tab click paid that again.

Now there is one slim snapshot instead. `lib/snapshot.js` reads the league and
every team it references in two queries, drops what no page needs (odds caches,
audit log, pending trades) and swaps every embedded image for a URL pointing at
the `/api/team-logo/[teamId]` proxy, which already served logos with an ETag.
That takes 1.6 MB down to ~240 KB, about 37 KB over the wire.

`app/api/league-snapshot` serves it with `s-maxage=60`, and `getSnapshot()`
memoises it in-process for the same 60 seconds, so the origin does the work at
most once a minute no matter how many people are watching.

`lib/LeagueContext.jsx` is the client half. The site layout renders the snapshot
into `<LeagueProvider initial={…}>` so the first paint has real data with no
loading state, then the provider polls `/api/league-snapshot` every 60 seconds,
skipping the poll while the tab is hidden and catching up on focus. It also
keeps a copy in `sessionStorage` as a fallback for a reload that cannot reach
the server.

Every page under `app/(site)` is therefore a client component that reads
`useSeason()` or `useLeague()` and does no data fetching of its own. That is
what makes moving between tabs instant: the pages are static, Next prefetches
them, and the data they need is already in memory. The footer's Live dot shows
when a refresh is in flight and turns red if one fails; clicking it forces a
refresh.

The one thing to keep in mind when adding a page: put derived logic in
`lib/domain/*`, which is plain functions over the snapshot shape and runs on
either side of the wire. Anything that needs the raw league blob — admin
writes, anything with images — belongs in `/classic`, which still talks to
Supabase directly.
