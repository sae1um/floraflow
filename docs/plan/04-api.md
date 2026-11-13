# API

## Endpoints

All app routes sit under `/v1`, are defined with `@hono/zod-openapi` and appear at `/docs`. The web app and the future mobile app call them through Hono's typed client.

| Method and path | Who | Does |
| --- | --- | --- |
| `GET /v1/me` | User | Profile, roles, notification prefs |
| `GET /v1/greenhouses` | User | Greenhouses you belong to, with latest reading, online state and open alert count |
| `POST /v1/greenhouses/claim` | User | Pairing code + name/location/room → creates the greenhouse, you become owner |
| `GET /v1/greenhouses/:id` | Viewer+ | Detail: device, actuators, settings version, members count |
| `PATCH /v1/greenhouses/:id` | Editor+ | Rename, location, room, time zone |
| `DELETE /v1/greenhouses/:id` | Owner | Delete; unlinks the device and removes its MQTT login |
| `GET /v1/greenhouses/:id/readings?from&to` | Viewer+ | Downsampled series (≤ 300 points) |
| `GET /v1/greenhouses/:id/readings.csv?from&to` | Viewer+ | CSV export, streamed |
| `GET /v1/greenhouses/:id/events?from&to` | Viewer+ | Actuator events for the timeline |
| `GET` / `PUT /v1/greenhouses/:id/settings` | Viewer+ / Editor+ | Thresholds and report interval; PUT bumps the version and publishes config |
| `GET` / `POST` / `PATCH` / `DELETE /v1/greenhouses/:id/schedules[/:sid]` | Viewer+ / Editor+ | Schedules; writes publish config |
| `POST /v1/greenhouses/:id/commands` | Editor+ | Override, clear override, identify, reboot |
| `GET /v1/greenhouses/:id/commands/:cid` | Viewer+ | Command status (fallback if SSE is down) |
| `POST /v1/greenhouses/:id/firmware` | Editor+ | Start an OTA to a given version |
| `GET /v1/greenhouses/:id/alerts?status` | Viewer+ | Alerts for one greenhouse |
| `GET /v1/alerts?status&severity` | User | Alerts across your greenhouses |
| `POST /v1/alerts/:id/ack` | Editor+ | Acknowledge |
| `GET /v1/greenhouses/:id/members` | Viewer+ | Members and roles |
| `PATCH` / `DELETE /v1/greenhouses/:id/members/:uid` | Owner | Change role, remove |
| `POST /v1/greenhouses/:id/invites` | Owner | Create an invite link with a role (valid 7 days) |
| `POST /v1/invites/:token/accept` | User | Join with the invite's role |
| `GET /v1/stream?greenhouses=a,b` | Viewer+ per id | SSE: readings, device status, actuators, commands, alerts |
| `POST` / `DELETE /v1/push/subscriptions` | User | Register or remove a browser for web push |
| `GET` / `POST /v1/firmware` | Admin | List or upload builds (multipart) |
| `POST /v1/devices/register` | Public, rate-limited | First-boot registration |
| `POST /v1/devices/pairing-code` | Device | New 8-character pairing code |
| `GET /v1/devices/firmware/:version` | Device | Streams the build with `x-MD5` |
| `POST /internal/mqtt/messages`, `/internal/mqtt/events` | EMQX (shared secret) | Webhooks |
| `/api/auth/*` | — | Better Auth handler |
| `GET /health` | Public | Process up + database ping. Sim routes (/v1/sim/\*) are listed on the Simulator & demo tab |

## Auth and authorisation

Three kinds of caller, three checks: users by session, devices by their secret, EMQX by a shared secret.

**Users (Better Auth):**

- `drizzleAdapter(db, { provider: "pg" })`; email and password with verification and reset emails through Resend; GitHub and Google sign-in.
- Plugins: `anonymous` (demo visitors), `admin` (firmware uploads), `bearer` now and `@better-auth/expo` later for the mobile app.
- Web on `floraflow.<domain>`, API on `api.floraflow.<domain>`: same site, so the session cookie works with `crossSubDomainCookies` set to `.floraflow.<domain>`. The demo and sim subdomains share the same cookie. CORS allows only the app, demo and sim origins, with credentials.

**Roles:** `requireRole("viewer" | "editor" | "owner")` middleware loads the caller's membership for `:id` and returns `403` below the required role. Owner ⊃ editor ⊃ viewer.

| Action | Viewer | Editor | Owner |
| --- | --- | --- | --- |
| See readings, alerts, events | Yes | Yes | Yes |
| Overrides, thresholds, schedules, ack alerts, OTA | — | Yes | Yes |
| Invite, change roles, delete greenhouse | — | — | Yes |

**Devices:** `Authorization: Bearer <secret>` → SHA-256 → match `devices.secret_hash`. SHA-256, not bcrypt: the secret is 32 random bytes, so it can't be brute-forced, and bcrypt would eat Render's 0.1 CPU.

**EMQX webhooks:** constant-time comparison of the shared bearer secret.

**Demo mode:** "Try the demo" signs in anonymously and adds the visitor as an editor of two demo greenhouses fed by the simulator. Overrides work against the simulated devices. Anonymous users are deleted after 24 hours.

## Caching

One API instance means in-process caches are enough; no Redis until there are two instances.

| What | Where | Lifetime |
| --- | --- | --- |
| Device by ID (secret hash, greenhouse, status) | `lru-cache` in the API | 5 min; cleared on claim/remove |
| Membership role per (user, greenhouse) | `lru-cache` | 60 s; cleared on member changes |
| Latest reading + online state per greenhouse | In-memory map, written on every ingest; `latest_readings` is the durable copy | Live |
| Chart responses from hourly data | `Cache-Control: private, max-age=300` | 5 min |
| Chart responses from raw data | `Cache-Control: private, max-age=30` | 30 s |
| Browser data | TanStack Query (see Web app tab) | Per query |

**When scaling to 2+ instances:** Postgres `LISTEN/NOTIFY` for SSE fan-out, and Upstash Redis for rate limits and shared caches.

## Live updates and background jobs

**SSE hub:** `GET /v1/stream` uses Hono's `streamSSE`. The hub keeps a set of open streams per greenhouse ID; ingest, command and alert services publish into it. Event types: `reading`, `device`, `actuator`, `command`, `alert`. A comment line every 25 s keeps proxies from closing idle streams. Browsers reconnect by themselves after a Render restart.

**In-process jobs** (`croner`; database jobs run in pg\_cron instead):

| Job | Every | Does |
| --- | --- | --- |
| `offline-sweep` | 1 min | Devices disconnected for 5+ min → open a `device_offline` alert and send web push |
| `command-timeouts` | 15 s | `sent` for 30+ s without an ack → `failed` |
| `demo-simulator` | 60 s | Not a job: the Sim host runs virtual devices over real MQTT (see the Simulator & demo tab); a 1-min check stops idle visitor sims |
| `anonymous-cleanup` | Daily | Delete demo users older than 24 h and reset demo greenhouse settings |

## Rate limits, errors, logging and environment

**Rate limits** (`hono-rate-limiter`, in memory):

| Route | Limit |
| --- | --- |
| `POST /v1/devices/register` | 5/hour per IP |
| `POST /v1/devices/pairing-code` | 10/hour per device |
| `POST /v1/greenhouses/claim` | 10 per 15 min per user (pairing codes are guessable otherwise) |
| `POST /v1/greenhouses/:id/commands` | 30/min per user |
| `/api/auth/*` | Better Auth's built-in limiter |

**Errors:** one `onError` handler returns `{ error: { code, message, details? } }`. Zod failures become `400` with the issues; role failures `403`; unknown errors `500` with a request ID and no internals.

**Logging:** `pino` JSON logs to Render's log stream, with request ID, user ID and device ID where known. `@sentry/node` captures exceptions, tagged with the git SHA as the release.

**Environment** (validated with zod at boot; the API refuses to start if anything is missing):

| Variable | For |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres (session pooler) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Sessions |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Social sign-in |
| `RESEND_API_KEY` | Verification and reset emails |
| `EMQX_API_URL`, `EMQX_APP_ID`, `EMQX_APP_SECRET` | Publish commands, manage device logins |
| `EMQX_WEBHOOK_SECRET` | Checks incoming webhooks |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Firmware storage |
| `SENTRY_DSN` | Error tracking |
| `WEB_ORIGINS`, `SIM_SECRET_KEY` | App, demo and sim origins (CORS, Better Auth); key that encrypts virtual-device secrets |

## Packages and folder structure

| Package | For |
| --- | --- |
| `hono`, `@hono/node-server` | HTTP server |
| `@hono/zod-openapi`, `@scalar/hono-api-reference` | Validated routes, OpenAPI spec, `/docs` page |
| `better-auth` | Accounts, sessions, plugins |
| `drizzle-orm`, `postgres` | Database access (postgres.js driver) |
| `zod` | Validation (from `@floraflow/shared`) |
| `web-push` | VAPID web push |
| `@supabase/storage-js` | Firmware files |
| `croner` | In-process jobs |
| `lru-cache` | Caches |
| `hono-rate-limiter` | Rate limits |
| `pino` | Logs |
| `@sentry/node` | Error tracking |
| `resend` | Auth emails |
| `vitest` | Tests |

```text
apps/api/src/
  index.ts            # boot: env, Sentry, server, jobs
  app.ts              # Hono app, middleware, route mounting (exports AppType)
  auth.ts             # Better Auth instance
  middleware/         # session, requireRole, deviceAuth, webhookAuth, rateLimit, errors
  routes/             # greenhouses, readings, settings, schedules, commands, alerts,
                      # members, invites, push, firmware, devices, internal-mqtt, stream
  services/           # ingest, alerts, commands, config, emqx, push, sse-hub, storage
  jobs/               # offline-sweep, command-timeouts, demo-simulator, anonymous-cleanup
  lib/                # caches, crypto (sha256, codes), downsample, csv
```
