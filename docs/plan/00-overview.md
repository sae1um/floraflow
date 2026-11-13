# FloraFlow V2 — Rebuild Plan

Nov 12, 2026 · @Godswill Erhunmwunse

FloraFlow V2 runs at £0 on free tiers: Cloudflare Pages for the web app, Render for the API, EMQX Serverless for MQTT and Supabase for Postgres, with Better Auth for accounts. That holds to about 20 always-online devices; past that, EMQX and Supabase are the first bills.

Detail by part: Hardware & firmware · Device protocol · Database · API · Web app · Simulator & demo · Engineering

## Decisions

| Area | Decision | Why |
| --- | --- | --- |
| Audience | You, friends/family with kits, recruiters via a demo mode | Real multi-user app, plus a no-hardware way to show it off |
| Scale | Designed for hundreds of greenhouses, run free at \~20 | Same architecture scales by paying, not rewriting |
| Board | Wemos D1 mini (ESP8266), I²C sensors + ADS1115 | Cheap and enough; I²C works around the single analog pin |
| Device transport | MQTT over TLS via EMQX Serverless | Overrides land in seconds; EMQX forwards messages to the API as webhooks for free |
| Data freshness | Device reports every 60 s; commands within seconds | Near-live is enough for plants; MQTT makes commands fast at no extra cost |
| Database | Supabase Postgres, used as plain Postgres, via Drizzle | Compute stays on, so constant device writes don't burn a compute allowance (Neon's would run out mid-month) |
| History | Raw readings 90 days, hourly rollups forever | Detail for recent charts, summaries for long-term trends |
| API | Hono on Node, hosted on Render | Typed client for web now and mobile later; a long-lived process for SSE and jobs |
| Auth | Better Auth: email/password, GitHub, Google | Users live in your own Postgres; anonymous demo users; Expo plugin for the mobile app later |
| Sharing | Owner, Editor, Viewer roles per greenhouse | Household members can watch or control |
| Web app | Vite + React + TanStack Router/Query, Tailwind v4 + shadcn/ui, on Cloudflare Pages | Static app behind a login on a free CDN |
| Live updates | Server-sent events from the API | Data only flows server → browser |
| Alerts | In-app + web push | Your chosen channels; web push needs no third party |
| Features in V2 | Alerts, schedules, sharing, CSV export | As chosen |
| Wi-Fi setup | Captive portal (WiFiManager) | No credentials compiled into firmware |
| Firmware updates | OTA from the dashboard | Ship fixes without USB |
| Mobile | React Native/Expo later, reusing the API and auth | API returns JSON only; Better Auth supports bearer tokens |
| Repo | pnpm + Turborepo monorepo, TypeScript, Biome | One shared zod package is the contract for API, web and simulator |
| Quality | CI on every PR, Sentry + structured logs, device simulator | Simulator also feeds the recruiter demo |
| Simulator and demo | Virtual greenhouses on sim.floraflow, a split-screen demo on demo.floraflow | Test and show the whole system without hardware, over the real protocol |
| Domains | floraflow.\<domain> (app), api., demo. and sim.floraflow.\<domain> | One parent domain, so one session cookie covers app, demo and sim |

## Architecture

Devices talk only to EMQX over MQTT. EMQX forwards every device message to the API as an HTTP webhook, and the API publishes commands back through EMQX's REST API. There is no hub: each greenhouse connects over its own Wi-Fi.

&#91;embedded content: V2 infrastructure · 6 parts, every data path\]

The API is the only writer to Postgres. Browsers never talk to EMQX or the database directly; they get data over REST and live updates over server-sent events.

## Hosting and free-tier budget

Everything is £0 up to about 20 always-online devices. The first limits are EMQX's monthly session minutes and Supabase's 500 MB database.

| Part | Platform | Free allowance that matters | Fits at £0? |
| --- | --- | --- | --- |
| Web app | Cloudflare Pages | Static hosting on a global CDN | Yes |
| API | Render free web service | 750 instance hours/month per workspace; sleeps after 15 min without inbound traffic ([Render](https://render.com/docs/free)) | Yes: EMQX webhooks arrive every minute, so it stays awake (\~720 h/month) |
| MQTT broker | EMQX Serverless | 1M session minutes, 1 GB traffic, 1M rule actions per month; HTTP webhook forwarding included ([EMQX plans](https://docs.emqx.com/en/cloud/latest/price/plans.html)) | \~20 devices: each is \~43,800 session minutes and \~43,800 webhook calls a month |
| Database | Supabase free, Postgres only | 500 MB database; pauses after 1 week without activity ([Supabase](https://supabase.com/pricing)) | \~20–30 devices at 90-day raw retention |
| Firmware files | Supabase Storage | 1 GB | Yes (a build is \~0.4 MB) |
| Auth | Better Auth (a library inside the API) | No vendor limits | Yes |
| Auth emails | Resend free plan | Verification and password reset only | Yes |
| Errors | Sentry free plan | Web + API exceptions | Yes |

The demo simulator writes readings every minute, so Supabase never sees a week without activity, even if every real device is off.

**What costs first at 100 devices:**

- **EMQX:** \~4.4M session minutes and \~4.5M rule actions a month. At [$2 per million session minutes and $0.25 per million rule actions](https://docs.emqx.com/en/cloud/latest/price/pricing.html) above the free quota, that is about $8/month.
- **Supabase:** 90 days of raw readings for 100 devices is \~1.3 GB, past the 500 MB cap. Either the Pro plan or a 30-day raw window.
- **Render:** outbound bandwidth on the free plan was cut to 5 GB/month in April 2026 ([SnapDeploy](https://snapdeploy.dev/state-of-free-hosting)). SSE traffic is the thing to watch.

## Alternatives considered

| Option | Rejected because |
| --- | --- |
| Neon (database) | Free compute suspends after 5 min idle and allows 100 CU-hours/month ([Neon](https://neon.com/pricing)). Devices writing every minute keep it awake 24/7: \~182 CU-hours, so it would stop around day 16. |
| HiveMQ Cloud free (MQTT) | 100 connections and no webhook forwarding on the free plan ([HiveMQ](https://www.hivemq.com/pricing/fully-managed/)), so the API would need a process that stays connected and subscribed. |
| Clerk (auth) | Users live outside your database; Better Auth keeps them in Postgres with no user caps. |
| Koyeb (API hosting) | Free instance is 0.1 vCPU and scales to zero after 1 hour without traffic ([Koyeb](https://www.koyeb.com/docs/reference/instances)); a card hold has been required since February 2026. |
| Cloudflare Workers (API) | SSE fan-out and in-memory state would need Durable Objects: more moving parts than one Node process. |
| Plain HTTPS polling (transport) | Commands within seconds would mean \~12 requests/min per device. |
| Self-hosting (homelab/VPS) | Ruled out by the managed-cloud preference. Keep it as the fallback if free tiers shrink. |

## Build order

Start with phase 0: it tests the riskiest assumptions before any app code exists.

Each phase is broken into epics, features and tasks in Backlog & workflow.

0. **Spikes.** A D1 mini publishes to EMQX over TLS (check free heap). An EMQX rule posts to a local API through a tunnel. The API creates a per-device MQTT login and publishes a command via EMQX's REST API. Supabase Cron (pg\_cron) runs a job on the free plan. *Done when:* a real board's message reaches your laptop and a command reaches the board.
1. **Foundations.** Monorepo, CI, `shared` and `db` packages, Supabase project, Render and Cloudflare Pages deploys. *Done when:* an empty app deploys on every merge to main.
2. **Accounts and greenhouses.** Better Auth, greenhouse CRUD, roles, invite links. *Done when:* you sign up, create a greenhouse and invite a viewer.
3. **Device lifecycle.** Register, pairing codes, claim, MQTT logins, and a first cut of the sim engine as a CLI simulator. *Done when:* a simulated device pairs and shows online.
4. **Telemetry.** Webhook ingest, latest readings, SSE, charts with downsampling, rollups and retention. *Done when:* a 7-day chart of simulator data loads in under 200 ms.
5. **Control.** Thresholds, schedules, retained config, commands with acks, actuator events. *Done when:* a manual override reaches the simulator and shows as applied in under 3 s.
6. **Alerts.** Threshold and offline alerts, in-app list, web push. *Done when:* unplugging a device sends a push within 6 minutes.
7. **Real firmware.** Sensors, control loop, captive portal, offline buffer, OTA. *Done when:* a real greenhouse runs 7 days unattended and takes one OTA update.
8. **Portfolio polish.** Sim engine and Sim host, sim panel, demo site, CSV export, landing page, ADRs, README with the architecture diagram. *Done when:* a recruiter on demo.floraflow makes a heatwave in the sim panel and watches the dashboard open the vent.

## Open questions

- [ ] Buy the new domain. The plan writes it as `<domain>`: the app is `floraflow.<domain>`, with `api.`, `demo.` and `sim.` subdomains under it.

## First-draft stack (superseded)

Replaced by the Decisions table above. Kept only until the comment on it is resolved; delete this section afterwards.

| Part | Recommendation | Why |
| --- | --- | --- |
| Repo | TypeScript monorepo (pnpm workspaces) with a `shared` package | Reading payload and API types defined once with zod, so the parts can't disagree |
| Frontend | Vite + React + TanStack Query (+ TanStack Router) | Next.js adds little for a dashboard behind a login; Query handles caching and refetching for live data |
| API | Hono or Express 5, with zod validation | Hono gives a typed client for free; Express is fine if you'd rather not learn something new |
| Device ↔ server | HTTPS POST; pending commands returned in the response; device checks every few seconds | No broker to run; manual override lands within seconds; MQTT can come later without changing the data model |
| Live dashboard | Server-sent events | Simpler than WebSockets, since data only flows server → browser |
| Database / auth | Neon + Drizzle, Clerk | Nothing wrong with them |
