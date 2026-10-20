# Zygarde

Formerly called Magnezone. Docker images up to 2.8.0 were published as `xerock/magnezone`; from 2.9.0 they're `xerock/zygarde`.

A SvelteKit dashboard for managing [Dragonite](https://github.com/UnownHash/Dragonite-Public) scanner area configuration: enabling/disabling areas, editing geofences on a map, generating scan routes via [Kōji](https://github.com/TurtIeSocks/Koji), and letting a Discord community vote on which areas matter most to them. It's a ground-up rewrite of an earlier app, replacing a runtime plugin system with a plain, statically-typed feature-folder codebase — every feature is added via normal code, no dynamic registry.

## Features

- **Discord Login** — OAuth 2.0 sign-in, session cookie backed by MySQL (or in-memory if no DB is configured), guild-role-based permissions.
- **Area management** — enable/disable an area as a whole, or its Pokémon/Fort/Quest/Rare-Pokémon modes individually; edit per-mode worker counts. The area list has a combinable **Filters** panel (admin-only) for narrowing it by token-funding status (under/meeting/above target), a worker-count range (by mode), and route-generation freshness (within N days, or never generated) — on top of the existing Enabled/Disabled tabs.
- **Visual geofence editor** — drag vertices, insert midpoints, right-click delete, snapping against neighboring areas' boundaries, directly on the Leaflet map. Edits can optionally be pushed to the same-named Kōji geofence, preserving its parent, projects, mode, and properties (see Kōji below).
- **Kōji route generation** — generate spawnpoint or bootstrap routes for an area's geofence, streamed live via Server-Sent Events; **batch mode** runs this across multiple selected areas sequentially plus bulk worker-count edits.
- **Token-based voting + weighted tiers** — logged-in users get a spendable token budget equal to their tier's weight (e.g. Free=1/Supporter=3/VIP=5, resolved from Discord roles with an optional admin override) and allocate it across areas with +/− steppers, optionally marking one funded area as primary ("♥"). Admins set a per-area **vote target** — a static number, or _N_ Pokémon-mode workers per token, with a global default plus a per-area override — so area cards show funded/target progress (and a header token-budget indicator shows each user's remaining/total) instead of a raw vote count. If a user's budget shrinks (tier downgrade, admin override change, lapsed subscription), their oldest allocations are trimmed automatically to fit, primary area preserved first.
- **Subscription sync (optional)** — periodically re-checks each elevated user's current Discord roles (no external database involved) and drops anyone who's lost the required role back to a zero-token tier once they've failed that check for longer than a configurable grace period, trimming their existing vote allocations to fit via the normal token-budget enforcement. Unconfigured deployments simply skip this entirely.
- **Worker autoscale (optional)** — per-area, opt-in throttling of Pokémon-mode worker count to a percentage of a fixed baseline (snapshotted from the area's live count when enabled), based on how funded its vote target currently is: 100% funded runs the full baseline, tapering down to 10% at zero tokens. A background job re-checks and applies this on an admin-configurable interval (default 15 minutes, with a "Run Now" button on `/admin/autoscale` to apply immediately rather than waiting out the interval); mass-enable/disable is available from Batch Mode. Enabling requires a vote target already be set for the area. Disabling restores the area to its stored baseline.
- **Area requests** — users can request a new area be added (draw a geofence) or an existing one removed, with admin review, Discord DM on resolution, and an optional alert-webhook notification (with a static map preview image). The admin review page (`/admin/requests`) shows each request's geofence coverage (sq mi/km, vertex count) to help size starting worker counts, and approving an addition into a new Dragonite area can, in the same action, also set its vote target, enable worker autoscale, and/or create the matching geofence in Kōji, and/or generate and save a Kōji bootstrap route. Members can request an addition as **temporary** with start and end dates; admins manage those on a Temporary tab (edit dates, make permanent), and an hourly job switches them on and off. Admins can also edit a request's geofence on the review map before approving. Areas created this way get Dragonite quest hours `1,10` (quest checks at 1:00 and 10:00) unless `DEFAULT_QUEST_HOURS` says otherwise.
- **Spawnpoint counts (Golbat)** — read-only, cached counts of spawnpoints per area (All / Recent / Confirmed), pulled directly from a Golbat database.
- **Admin dashboard** — every admin page shares a nav bar (Dashboard / Tiers / Autoscale / Requests / Spawnpoints / Tileserver). `/admin/dashboard` has summary cards (token goals, voting coverage, capacity: tokens spent and running vs. baseline workers), an area ranking table (tokens split into active-subscriber vs. other, % of token goal, subscriber share, voters, baseline workers; sortable by all or subscriber tokens, top 5/10/all), top 5/10 voters, and the list of enabled areas with no votes. `/admin/tiers` (search/override user tiers; set the global workers-per-token default and the subscription grace period), `/admin/autoscale` (the worker-autoscale sync interval, a manual "Run Autoscale Sync Now", and a status table of every autoscale-enabled area: funding, speed tier, current vs. next-sync workers, baseline), `/admin/requests` (approve/reject area requests), `/admin/spawnpoints` (cache stats, TTL/recent-window settings), `/admin/tileserver` (configure the map tile server; the old `/admin/map` URL redirects there). Per-area vote targets and worker autoscale are set inline on each area card instead (admin-only, when expanded).

## Tech stack

- [SvelteKit 2](https://kit.svelte.dev/) / [Svelte 5](https://svelte.dev/) (runes), TypeScript, `adapter-node`
- [Leaflet](https://leafletjs.com/) for the map
- MySQL (via `mysql2`) for sessions, votes, tiers, requests, geofence archive, spawnpoint cache, worker autoscale state, and map tile settings — all optional; the app degrades gracefully feature-by-feature without it
- [Vitest](https://vitest.dev/) for tests, [Prettier](https://prettier.io/) for formatting (no ESLint)
- [pino](https://getpino.io/) for logging

## Prerequisites

- Node.js 20.6 or newer (`npm run start` uses `node --env-file=.env`). The Docker image uses Node 22.
- A running [Dragonite](https://github.com/UnownHash/Dragonite-Public) instance (v2 API). This is the only hard requirement: the app shows an error page without it.
- A Discord application, for login, voting and admin access.
- Optional: a MySQL or MariaDB database for Zygarde's own data (strongly recommended, since voting, tiers, area requests and every admin settings page need it), a [Kōji](https://github.com/TurtIeSocks/Koji) instance, a [Golbat](https://github.com/UnownHash/Golbat) database, and a staticmap tileserver such as Rampardos.

## Getting started

```bash
git clone https://github.com/XerockXMG/zygarde.git
cd zygarde
npm install
cp .env.example .env
# edit .env: set DRAGONITE_URL, and see Configuration below for the rest
npm run dev
```

The dev server runs at `http://localhost:5173`. To log in locally, add `http://localhost:5173/auth/discord/callback` to your Discord application's redirects (see [Discord login](#discord-login-optional-needed-to-log-in)).

## Configuration

Everything is set in `.env`. [`.env.example`](.env.example) lists every setting with a short explanation; this section covers how they fit together. Only `DRAGONITE_URL` is required. Leave any other setting empty and the feature that needs it is simply turned off.

Some things are set in the app instead, by an admin: vote targets, the workers-per-token ratio and subscription grace period (`/admin/tiers`), the autoscale interval (`/admin/autoscale`), spawnpoint cache settings (`/admin/spawnpoints`) and the map tile server (`/admin/tileserver`).

### Discord IDs and role lists

Turn on Developer Mode in Discord (User Settings > Advanced), then right-click a server, role or user and choose **Copy ID**.

Every setting that grants something by role takes a **role list**: Discord role IDs separated by commas.

```bash
OFFLINE_AREA_ACCESS="555555555555555555,666666666666666666"
```

- A role counts no matter which server it belongs to, as long as that server is in `DISCORD_GUILD_IDS`. Role IDs are unique across Discord, so there's no need to say which server a role is from.
- A server's own ID counts as a role every member of that server has (it's the ID of the server's @everyone role). Use it to grant something to everyone in a server.
- Admins (`ADMIN_DISCORD_IDS`) can always see and do everything, whatever the role lists say.
- Roles are read when someone logs in, so role changes apply at their next login. A login lasts 24 hours.

The older `{"serverId": ["roleId", ...]}` JSON format is still accepted anywhere a role list is.

### Server

All optional, except `ORIGIN`, which is required in production.

| Setting                                  | Default          | What it does                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`                                 | none             | The public address of the site, like `https://areas.example.com`. **Required in production**: behind a reverse proxy, form submissions are rejected without it. Also used for the Discord login callback and links in Discord messages. `npm run dev` ignores it. |
| `PORT`                                   | `3000`           | Port the server listens on with `npm run start` or Docker.                                                                                                                                                                                                        |
| `LOG_LEVEL`                              | `info`           | How much to log: `fatal`, `error`, `warn`, `info`, `debug` or `trace`.                                                                                                                                                                                            |
| `SITE_NAME`                              | `Scanner Areas`  | Name shown at the top left of every page.                                                                                                                                                                                                                         |
| `FAVICON_PATH`                           | built-in icon    | Absolute path to a custom favicon (`.ico`, `.png`, `.svg`, `.gif`, `.jpg` or `.webp`). In Docker, mount the file at this path. A replaced file is picked up without a restart.                                                                                    |
| `START_LAT` / `START_LON` / `START_ZOOM` | `20` / `0` / `2` | Where the map opens (zoom 0–22), on the main page and the /admin/requests map. The map then zooms to fit the areas, so this mostly shows for a moment on load, or when there are no areas yet.                                                                    |
| `GA_MEASUREMENT_ID`                      | none             | Google Analytics 4 measurement ID (`G-…`). Leave empty for no analytics.                                                                                                                                                                                          |

### Dragonite (required)

```bash
DRAGONITE_URL="http://127.0.0.1:7272"
DEFAULT_QUEST_HOURS="1,10"   # optional
```

Dragonite is where areas live; Zygarde reads and edits them through its v2 API. `DEFAULT_QUEST_HOURS` sets the quest hours for areas created by approving an area request: the hours of the day (0–23, comma-separated) at which Dragonite checks for quest changes, starting a quest scan if it finds any. The default `1,10` means a check at 1:00 and another at 10:00, not a scan running from 1 to 10.

### Database (optional, recommended)

```bash
LOCAL_DATABASE_URL="mysql://zygarde:password@127.0.0.1:3306/zygarde"
```

A MySQL or MariaDB database for Zygarde's own data: logins, votes, tiers, area requests, geofence history, autoscale state, and the settings on the admin pages. Tables are created and updated automatically every time the app starts (see [Database schema](#database-schema--no-separate-migration-step)). Without it, those features are off and logins only last until the next restart.

### Discord login (optional, needed to log in)

```bash
DISCORD_CLIENT_ID="123456789012345678"
DISCORD_CLIENT_SECRET="your-client-secret"
DISCORD_BOT_TOKEN="your-bot-token"
DISCORD_GUILD_IDS="111111111111111111,222222222222222222"
ADMIN_DISCORD_IDS="333333333333333333"   # optional
DISCORD_REDIRECT_URI=""                   # optional, see step 1 below
```

To set up the Discord application at <https://discord.com/developers/applications>:

1. **OAuth2 page:** copy the client ID and secret, and add `<ORIGIN>/auth/discord/callback` under **Redirects** (plus `http://localhost:5173/auth/discord/callback` for local development). If you need a different callback address, set it in `DISCORD_REDIRECT_URI`; otherwise leave that empty.
2. **Bot page:** copy the token, then add the bot to every server in `DISCORD_GUILD_IDS`. It needs no permissions and no privileged intents. It only looks up the roles of whoever is logging in, one user at a time.

`DISCORD_GUILD_IDS` is the list of servers whose roles count. Roles from any other server are ignored, even if they're in a role list. `ADMIN_DISCORD_IDS` is a comma-separated list of Discord **user** IDs with full admin access: every area control and all `/admin` pages.

### Who can see what (optional)

```bash
OFFLINE_AREA_ACCESS=""   # see disabled areas, not just enabled ones
ROUTE_ACCESS=""          # see the Pokémon, fort and quest route layers on the map
SPAWNPOINT_ACCESS=""     # see spawnpoint counts (needs GOLBAT_DATABASE_URL)
```

Each is a [role list](#discord-ids-and-role-lists). Empty means admins only. Anyone can view enabled areas and their token totals without logging in. Voting needs a login.

`ROUTE_ACCESS` replaces the older `POKEMON_ROUTE_ACCESS`, `FORT_ROUTE_ACCESS` and `QUEST_ROUTE_ACCESS`, which still work and each grant just their own layer.

### Voting tiers (optional)

```bash
VOTE_TIERS='[{"name":"Free","weight":1,"roles":["111111111111111111"]},{"name":"VIP","weight":3,"roles":["555555555555555555"]}]'
```

Each tier has a `name`, a `weight` and the `roles` that grant it. The weight is the number of tokens the tier's members can put on areas. A user gets the highest-weight tier they have a role for. In this example, every member of server `111111111111111111` gets Free (1 token), and anyone with role `555555555555555555` gets VIP (3 tokens).

- A user who matches no tier gets **0 tokens**. To give everyone at least one token, add a tier whose roles include your server's ID, like Free above.
- Leave `VOTE_TIERS` empty and everyone who logs in gets 1 token.
- An admin can set a user's tier by hand on `/admin/tiers`. That always wins over roles, and the subscription check below never changes it.
- If a user's tokens go down (a lower tier, an admin change, a lapsed subscription), their oldest token placements are removed until they fit, keeping their primary area's tokens for last.

Tiers used to get their roles from a separate `VOTE_TIER_ROLES` setting. It still works for any tier without its own `roles`.

### Subscription check (optional)

```bash
SUBSCRIPTION_REQUIRED_ROLES="555555555555555555,666666666666666666"
```

A [role list](#discord-ids-and-role-lists) for paid tiers that should lapse when someone stops paying. Tiers are normally only re-checked when a user logs in; this catches people who stop subscribing but never log in again. It needs `DISCORD_BOT_TOKEN` and `LOCAL_DATABASE_URL`.

Once a day, every user with tokens and no admin override is checked:

- If they hold one of these roles, nothing happens.
- If not, a grace period starts (set on `/admin/tiers`, default 7 days). Getting a role back at any point ends it.
- After the grace period, they drop to 0 tokens and their tokens come off their areas.

**Don't use it alongside a free tier.** Free users don't hold these roles, so they'd lose their tokens too.

The check looks up one user at a time, about four a second, using the same Discord lookup as login. It never downloads a server's whole member list, which would need Discord's privileged Server Members intent.

### Kōji (optional)

```bash
KOJI_URL="http://127.0.0.1:8080"
KOJI_SECRET="your-koji-secret"
```

`KOJI_URL` turns on three features. `KOJI_SECRET` is Kōji's API secret: it's sent with route generation and geofence creation, and used as the password for Kōji's admin login, which updating a geofence needs. Leave it empty only if your Kōji has no secret.

- **Route generation:** spawnpoint or bootstrap routes for an area, one area at a time or in batch mode, saved to Dragonite.
- **Creating a geofence** when approving an area request. Kōji replaces any geofence with the same name, wiping its parent, mode and custom properties, so Zygarde refuses before creating anything if Kōji already has a geofence by that name (ignoring capitalization).
- **"Also update in Kōji"** when saving or restoring a geofence (off by default). This updates the shape of the Kōji geofence whose name exactly matches the area's, and keeps its parent, mode, projects and custom properties. It never creates a geofence: if no name matches exactly, Kōji is left alone and the admin is told why. The Dragonite save always happens first and never fails because of Kōji.

### Spawnpoints (Golbat, optional)

```bash
GOLBAT_DATABASE_URL="mysql://golbat_readonly:password@127.0.0.1:3306/golbat"
```

Golbat's own database, for spawnpoint counts per area. Zygarde only reads it, so a read-only database user is enough. Counts are cached in Zygarde's database; the cache settings are on `/admin/spawnpoints`. Who can see the counts is set by `SPAWNPOINT_ACCESS`.

### Discord alerts (optional)

```bash
DISCORD_ALERT_WEBHOOK_URL="https://discord.com/api/webhooks/..."
ALERT_AREA_REQUESTS="true"
ALERT_TOKEN_CHANGES="true"
ALERT_TEMP_AREA_EXPIRED="true"
STATIC_PROVIDER_URL="http://127.0.0.1:8090"
```

Every alert goes to the one webhook. Each kind is off unless its setting is `true` (`1`, `yes` and `on` also work):

- `ALERT_AREA_REQUESTS`: someone submits a request to add or remove an area.
- `ALERT_TOKEN_CHANGES`: someone adds or removes tokens on an area, showing the area's new total and how funded it is. Tokens removed automatically, when someone's tier drops, aren't posted.
- `ALERT_TEMP_AREA_EXPIRED`: a temporary area reached its end date and was switched off.

`STATIC_PROVIDER_URL` is a staticmap tileserver (Rampardos, or SwiftTileserverCache) that draws the area's map image on these alerts and on the DM a user gets when their area request is resolved. It must have the `poracle-area` staticmap template. Leave it empty and those messages have no image.

To add a new kind of alert, add its setting to `ALERT_TOGGLES` in `src/lib/server/alerts.ts` and call `postAlert` with it.

### Temporary areas (optional)

Members can request an area addition as temporary, with a start and end date. `TEMP_AREA_TIMEZONE` (an IANA zone such as `America/New_York`, the default) decides what "today" means when those dates are validated. An invalid value logs a warning once and falls back to the default.

An hourly background job switches each temporary area on the day before its start date, DMs the requester the day before it ends, and switches it off on its end date. An area is never re-enabled automatically after that.

## Development

```bash
npm run dev           # start the dev server
npm run check          # type-check (svelte-kit sync + svelte-check)
npm run check:watch    # type-check, watch mode
npm run test            # run the full test suite (vitest)
npm run format           # format the codebase (prettier)
npm run format:check     # check formatting without writing
```

To run a single test file or a subset by name:

```bash
npx vitest run src/lib/features/voting/server/votes.test.ts
npx vitest run -t "getAreaTokenTotals"
```

Tests are colocated next to the code they cover (`foo.ts` / `foo.test.ts`) and run against plain functions/mocked dependencies — there's no real database or external service needed to run the suite. Server modules that touch the local DB take a minimal `QueryExecutor` interface as a parameter instead of importing a DB pool directly, so tests just pass a fake:

```ts
import { vi } from 'vitest';
import { getAreaTokenTotals, type QueryExecutor } from './votes';

const executor: QueryExecutor = {
	execute: vi.fn().mockResolvedValueOnce([[{ area_id: 1, total: 3 }], undefined])
};
const totals = await getAreaTokenTotals(executor); // { 1: 3 }
```

## Project structure

```
src/
  routes/
    +layout.server.ts / +layout.svelte   # hydrates session/user once, shared shell (Header, MobileTabs)
    +page.server.ts / +page.svelte        # home page — area list + map, and most form actions
    auth/discord/, auth/discord/callback/, auth/logout/
    admin/                                 # admin-only route group (hard-gated in hooks.server.ts)
      +layout.svelte                           # shared admin nav bar
      dashboard/, tiers/, autoscale/, requests/, spawnpoints/, tileserver/ (map/ redirects there)
    favicon/+server.ts                       # serves the optional FAVICON_PATH custom favicon
    api/
      koji/+server.ts                       # SSE route-generation stream
      spawnpoints/+server.ts                # spawnpoint count queries
  lib/
    features/
      auth/              # Discord OAuth, session store (DB or in-memory), guild-role resolution
      area-management/    # Area domain type, Dragonite client, area list/toggle/worker UI, list-filter criteria, Kōji client, batch mode
      map/                 # Leaflet rendering, geofence editor, GeoJSON<->vertex conversion, tile-server admin config
      voting/               # votes, primary area, weighted tiers, tier resolution
      area-requests/        # user-submitted add/remove requests, admin review, Discord notifications
      spawnpoints/           # Golbat client, caching, admin controls
      subscriptions/          # optional Discord-role-based subscription sync (see Subscription check above)
      autoscale/               # optional per-area worker throttling driven by vote-target funding % (see Worker autoscale above)
      admin-dashboard/          # /admin/dashboard stats, vote report, area ranking (active-subscriber scoping)
    server/
      db.ts                  # MySQL pool + full schema bootstrap (one CREATE TABLE per feature)
      scheduler.ts             # in-process periodic jobs started at boot (subscription sync, worker autoscale sync)
      pageHead.ts               # favicon link + optional Google Analytics tags injected into app.html at render time
      logger.ts
    components/               # cross-feature layout chrome: Header, admin/ (AdminPage, Panel — the admin UI kit)
    utils/                     # access.ts (role-check), postForm.ts, csv.ts, time.ts, errors.ts
```

Every feature under `lib/features/<name>/` follows the same internal shape: `types.ts` for domain types, `server/` for DB access and external API clients (imported only from `+page.server.ts`/`+server.ts` files, never the client), `stores/*.svelte.ts` for the rare cases that need client-side shared state (Svelte 5 rune classes), and `components/` for the Svelte UI.

Almost every mutation in the app — toggling an area, voting, saving a geofence, submitting a request — is a named SvelteKit [form action](https://kit.svelte.dev/docs/form-actions) rather than a REST endpoint; see `src/routes/+page.server.ts` for the bulk of them. UI outside a normal `<form>` context (e.g. a button inside a Leaflet map popup) calls these via `src/lib/utils/postForm.ts`:

```ts
import { postForm } from '$lib/utils/postForm';

const result = await postForm('?/allocateTokens', { id: String(area.id), amount: '2' });
if (!result.ok) alert(result.message ?? 'Failed to save your token allocation.');
```

## Deployment

### Database schema — no separate migration step

`src/lib/server/db.ts` defines the entire schema as `SCHEMA_STATEMENTS` — one `CREATE TABLE IF NOT EXISTS` per feature, plus `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for columns added after a table already existed in the wild. `ensureSchema()` runs this list every time the app boots (called from `hooks.server.ts`), so **restarting the app with new code _is_ how a schema change gets applied** — there is no `migrate` command to run by hand, and nothing to run directly against the database yourself. If a change ever needs something these idempotent statements can't express (backfilling a column from existing data, renaming a column, a NOT NULL column without a usable default), that would need a one-off manual SQL step before restarting — but every schema change so far has been additive and fits the `IF NOT EXISTS` pattern.

### Bare metal / systemd

```bash
npm run build
npm run start   # node --env-file=.env build
```

`adapter-node` produces a standalone Node server in `build/`. Set `PORT` and `ORIGIN` for your deployment; put a reverse proxy (nginx, Caddy, etc.) in front for TLS. In practice this is commonly run under a process manager rather than a bare foreground process — [pm2](https://pm2.keymetrics.io/) (`pm2 start npm --name zygarde -- start`) or a systemd unit that runs the same `npm run start` are both common choices.

**Updating an existing deployment:** pull the new code, run `npm run build` again (this replaces `build/` with the newly compiled output), then restart however the process is managed — `pm2 restart <name>` or `systemctl restart <service>`. The schema step above happens automatically as part of that restart; there's no separate database step to remember.

### Docker

A multi-stage `Dockerfile` is included, built to run on both x86 and ARM hosts via `docker buildx`. The builder stage runs on `$BUILDPLATFORM` (your native build machine) rather than being emulated for the target platform — `npm ci`/`npm run build` stay fast even when cross-building for arm64 from an x86 host, since the compiled output is pure JS and the runner stage just copies it in.

**Quick start (Docker Compose — recommended):**

```bash
cp docker-compose.yml.example docker-compose.yml
cp .env.example .env
```

Open `docker-compose.yml` and set `MARIADB_ROOT_PASSWORD`/`MARIADB_PASSWORD`, then in `.env` set at minimum `DRAGONITE_URL` and `LOCAL_DATABASE_URL=mysql://zygarde:<MARIADB_PASSWORD>@mariadb:3306/zygarde` (matching the password you just set — `mariadb` is the service name and only resolves inside the Compose network). Then:

```bash
docker compose up -d
docker compose logs -f zygarde
```

This starts MariaDB, waits for it to be healthy, then starts the app on port 3000. To use a different host port, change the first number in the `3000:3000` mapping in `docker-compose.yml`; leave `PORT` in `.env` at `3000`, since that's the port inside the container. Set `ORIGIN` to the address people will actually use, including when that's a reverse proxy in front of this port. The `route-backups` named volume persists Kōji route-backup files across restarts — Compose creates it automatically (no `docker volume create` needed); the container is named `zygarde` (`container_name`) so `docker logs zygarde` etc. work without the Compose prefix. To use a custom favicon, uncomment the `favicon.ico` bind mount in `docker-compose.yml` and set `FAVICON_PATH=/app/custom/favicon.ico` in `.env`. `DRAGONITE_URL` and `GOLBAT_DATABASE_URL`, if you use it, point at services outside this Compose stack — use their real host/IP, not a Compose service name.

To update: `docker compose pull && docker compose up -d` — the new container's entrypoint runs the same automatic schema step described above on boot, so this covers both the code and the database in one step. To stop: `docker compose down` (add `-v` to also wipe the MariaDB volume).

**Single container** (bring your own MySQL/MariaDB):

```bash
docker run -d \
  --name zygarde \
  --env-file .env \
  -p 3000:3000 \
  -v /your/host/route-backups:/app/route-backups \
  xerock/zygarde:latest
```

`docker run --env-file` doesn't remove quotes the way Docker Compose and Node do, so in an `.env` used this way, write values without the surrounding quotes (`ORIGIN=https://areas.example.com`, `VOTE_TIERS=[{"name":"VIP",...}]`).

That example bind-mounts a host directory. To use a Docker named volume instead, create it first (`docker volume create route-backups`) and pass `-v route-backups:/app/route-backups`. For a custom favicon, add `-v /your/host/favicon.ico:/app/custom/favicon.ico:ro` and `-e FAVICON_PATH=/app/custom/favicon.ico` (or set it in `.env`).

**Building locally** (e.g. to test changes before publishing):

```bash
docker build -t zygarde .
```

**Publishing a multi-arch image** (maintainers): pushing a version tag builds and publishes the image through GitHub Actions (`.github/workflows/docker.yml`):

```bash
git tag 2.9.0
git push origin 2.9.0
```

A tag in the form `X.Y.Z` (no `v` prefix) builds `linux/amd64` and `linux/arm64` images and pushes them to Docker Hub as `xerock/zygarde:X.Y.Z` and `xerock/zygarde:latest`. The tag is the version record, so there's no local build step. It needs two repository secrets, under **Settings > Secrets and variables > Actions**: `DOCKERHUB_USERNAME`, and `DOCKERHUB_TOKEN` (a Docker Hub access token, not the account password). Never push a tag for a version that's already on Docker Hub: the build would overwrite that image. Anyone running `docker compose pull` picks up the new `latest`.

Pull requests and pushes to `master` run `npm run check`, `npm run test` and `npm run format:check` (`.github/workflows/ci.yml`).

## Further reading

- [`CLAUDE.md`](CLAUDE.md) — architecture notes and conventions for AI coding agents working in this repo (permission model, the `QueryExecutor` DB pattern, integration boundaries, etc.).
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to report issues and send changes.

## License

Zygarde is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a public service, you must make your modified source available to its users.
