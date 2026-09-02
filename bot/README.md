# KPB listener bot

A standalone Node service that watches KPB's Discord channels, parses what gets
posted, and writes it into the same Supabase data the site reads. Confident
parses apply immediately; anything ambiguous is queued and DM'd to the admin for
a decision.

It is deliberately a separate process from the Next.js site: reading channel
messages needs a persistent gateway connection and the privileged MESSAGE
CONTENT intent, neither of which a serverless route can hold. Nothing here
imports from the site, and the site does not import from here.

## Running it

```bash
cd bot
npm install
cp .env.example .env      # fill it in
npm start
```

`npm test` runs the parser and applier tests. Neither needs Discord or Supabase.

### Discord setup

In the Discord developer portal, under your application's **Bot** tab, enable
**MESSAGE CONTENT INTENT**. Without it every message arrives with empty content
and the bot silently does nothing. Invite the bot with `View Channel` and
`Read Message History` on the channels you configure, and make sure you share a
server with it so it can open a DM.

### Database setup

Run `sql/bot_schema.sql` once in the Supabase SQL editor. It adds four tables
(`bot_team_emoji`, `bot_pending`, `bot_processed`, `bot_channel_cursor`) and
leaves the site's existing `kv_store` / `admin_roles` untouched.

`SUPABASE_SERVICE_ROLE_KEY` is required because `kv_store`'s row-level security
only allows writes from authenticated users. Keep that key on the host only —
it bypasses RLS entirely.

### Hosting

The process is host-agnostic: one long-running Node entry point, config entirely
from environment variables, graceful SIGINT/SIGTERM shutdown, JSON logs on
stdout. It runs unchanged on Railway, Fly.io, Render, a VPS under systemd or
pm2, or your own machine. There is no HTTP server and no port to bind.

If the bot is offline for a while, it catches up on restart: it records the last
message id it saw per channel and replays anything newer, up to
`BACKFILL_LIMIT`. On the very first run against a channel it marks existing
history as seen rather than replaying it, so pointing the bot at a channel with
months of backlog does not flood the queue.

## What it reads

Channels are mapped to a parser by id in the environment. `EXTRA_CHANNELS_JSON`
takes a `{"<channel id>": "<kind>"}` object for additional channels beyond the
four named ones.

### `final_scores`

```
<:AnaheimStars:139…> 0 - 4 <:LosAngelesReapers:141…> F/9 (berniezanoob CGSO) (<:LosAngelesReapers:141…> advance to the World Series)
<:TorontoTigers:135…>9 - 3 <:ArchersIPU:133…> F/9
```

The left emoji owns the left number and the right emoji the right number.
Whitespace around the emoji is optional. `F/N` records the innings; a bare `F`
is accepted but `N` is what distinguishes an extra-innings game. Parenthesised
groups are split into series notes (`leads series 2-1`, `advance`, `wins series
3-1`, `series tied 2-2`, `eliminated`) and free-text performance notes, which
are appended to the game's notes field.

Home and away are **not** inferred from the line's left-to-right order. The bot
looks up the scheduled game between those two teams and takes home/away from the
schedule, then assigns each score to the correct side. A line that matches no
unplayed scheduled game is queued rather than guessed at.

When a line carries a series note, the bot checks it: if the post says a team
leads 2-1 but the schedule works out to 2-0, that mismatch is a reason to queue.

### `transactions`

```
- Trade: <:LosAngelesReapers:141…> receive: Novatic_Legend (3 ⭐) (42/45)
<:StLouisArchers:130…> receive: doogypirate, Swaggyboygrind (3 ⭐) (38.5/45)
- Release: <:TorontoTigers:135…> release: dumnist (R)
- Sign: <:ChicagoBreeze:151…> sign: viperman110 (R)
```

A `-` bullet starts a new entry; unbulleted lines continue the current one, which
is how a trade's second side is picked up. `(N/M)` is read as the team's star
total after the move and `(N ⭐)` as the stars that side received.

On a **trade** those two numbers are treated as a checksum, not as data: players
already exist on rosters with their own star levels, so the bot moves them and
then verifies the receiving team's roster really does add up to the `(N/M)`
figure. A mismatch queues the trade instead of writing it. This sidesteps the
genuine ambiguity in `doogypirate, Swaggyboygrind (3 ⭐)`, where it is not
knowable from the text whether `3 ⭐` is per-player or the total for that side.

On a **sign** or **release** naming a single player, a trailing `(3 ⭐)` or `(R)`
is unambiguous and is stored as that player's star level, with `(R)` meaning
unrated/rookie — the same `null` the site uses.

### `suspensions`

```
<:ArizonaFirebirds:135…> Nxnjahh suspended 2 games. (Ejection)
<:AnaheimStars:139…> mrderek124679 banned from KPB. (Racism)
```

Also understands `suspended indefinitely`, `suspension lifted`, and `unbanned`.
The parenthesised reason is optional. Suspensions record the team's games-played
count at the time, matching how the site derives games remaining.

### `game_times`

**Provisional — no real samples yet.** It currently handles
`<emoji> @ <emoji> <t:1730000000:F>` (exact, from Discord's timestamp markup)
and `<emoji> @ <emoji> 9/14 8:00 PM ET` (parsed in `America/New_York`, matching
the site's own timezone handling). A time without a date assumes today in
Eastern and is always queued rather than applied. Send real examples from the
channel and this parser should be rewritten around them.

## Emoji to team mapping

Team emoji are not one-to-one with teams: Toronto Tigers posts under two
different emoji ids, and St. Louis Archers appears as both `StLouisArchers` and
`ArchersIPU`. The bot resolves an emoji in this order:

1. A row in `bot_team_emoji` for that emoji id. Confident.
2. The emoji name, stripped of punctuation and case, equal to a team's full
   name. Confident, and the mapping is learned so step 1 catches it next time.
3. The emoji name containing exactly one team's nickname (its last word).
   Not confident — the parse is queued with a dropdown asking which team it is.
   Answering teaches the mapping permanently.
4. Nothing, or more than one match. Queued with the same dropdown.

That third case is what handles `ArchersIPU`: you confirm it once, and every
future post using that emoji resolves without asking.

## Confidence and the review queue

A parse applies automatically only when nothing at all was uncertain: both teams
resolved from a known mapping, every player name matched a roster entry exactly,
exactly one scheduled game fits, and any series note or star checksum agrees
with the data. Every other outcome is written to `bot_pending` and DM'd with the
parsed interpretation, the specific reasons it stopped, and a link back to the
source message.

Set `AUTO_APPLY=false` to queue everything regardless — useful for the first
week while you see what it gets right.

The DM has **Apply anyway**, **Ignore**, and, when an emoji is unrecognised, a
team dropdown. Picking a team saves the mapping and re-reads the original
message from scratch, so the rest of the line gets a fresh parse with the new
mapping in place.

## Writing safely

The whole league is one JSON blob in `kv_store`, so a naive write would clobber
whatever an admin saved from the site a moment earlier. Every write here is a
compare-and-swap: read the row with its `updated_at`, apply the change, then
write conditional on `updated_at` being unchanged. If it moved, the bot re-reads
and retries, up to five times with backoff.

Each write also re-checks its own preconditions inside that read-modify-write —
the game is still unplayed, the traded player is still on the team it is being
traded from — so a race resolves by queueing for review rather than by
overwriting someone.

Messages are recorded in `bot_processed` by id, so a reconnect or a backfill
overlap will not double-apply anything.

## Playoff brackets

Scoring a playoff game in the site does more than store the score: it advances
the series, generates the next game with the correct home team, regenerates
downstream rounds, and sets the champion. `src/league/playoffs.js` is a faithful
port of that logic from `components/LeagueTracker.jsx`, so a score the bot
writes advances the bracket exactly as one typed into the site would.

One deliberate gap: reseeding between rounds (`settings.reseedPlayoffs`) needs
full standings with the site's tiebreakers, which are not ported. With reseeding
off — the default — behaviour is identical. **If you turn reseeding on, port
`computeStandings` and `computePlayoffSeeding` too, or the bot will pair the
next round by bracket position instead of by seed.**

The bot also clears `season.oddsCache` when it changes a game, because the odds
simulation is not ported and a stale cache would show wrong numbers. The site
regenerates the cache on its next visit to the Odds tab.

## Testing without writing anything

```bash
node src/dryrun.js final_scores samples/final-scores.txt
node src/dryrun.js transactions samples/transactions.txt
node src/dryrun.js suspensions samples/suspensions.txt
```

Prints the parse as JSON and writes nothing. Add `--resolve` to also match
against the live league — team lookups, roster lookups, schedule matching, and
the confidence verdict with its reasons. `--resolve` reads the database but is
explicitly run with alias learning off, so it will not write emoji mappings the
way the running bot does. It is the fastest way to see what the bot would do
with a channel's real backlog.

`samples/` holds the lines the parsers were built against; the same lines are
asserted in `test/parsers.test.js`.

## The site side

The site reads the same tables. Under **Admin** (needs `manageRosterMoves`)
there are two panels:

**Bot review queue** lists everything sitting in `bot_pending`, with the parsed
interpretation, the reasons the bot stopped, and a jump link to the original
message. Approving runs the site's own mutator — `saveScore`, `tradePlayers`,
`setPlayerSuspended` and so on — the identical code path as doing it by hand, so
there is no second implementation of these actions to drift. Rejecting closes
the row and writes nothing.

It also shows when the bot last saw a message, from `bot_channel_cursor`, which
turns red after an hour. That is the practical "is it still running?" check when
the bot lives on a machine that sleeps.

**Bot emoji mappings** lists `bot_team_emoji` and lets a Commissioner or Site
Owner repoint, remove, or hand-add a mapping. Pasting an emoji straight into the
field works — it arrives as `<:Name:123…>` and the id is pulled out of it. A
team with two emoji is just two rows.

Approving from the site and approving from the DM do the same thing and both
close the row, so it does not matter which you use.

## Known gaps

- `game_times` needs real examples before it can be trusted.
- Edited and deleted messages are ignored. Correcting a posted score means
  fixing it on the site.
- Per-player box score stats are not read from these channels; the site's OCR
  import still handles those.
- A trade involving three or more teams parses, but the checksum assumes each
  player comes from one of the other listed sides.
- The site's own saves are still last-write-wins. The bot writes with
  compare-and-swap and retries, but `persistLeague` in the site does a plain
  upsert, so a save from an open browser tab can still overwrite a change the
  bot made seconds earlier. Giving the site the same compare-and-swap is the
  real fix; until then, avoid sitting on the admin screens with unsaved state
  while scores are being posted.
