# Backlog and workflow

Every phase of the build order as Epic → Feature → Task, plus how to run the board, where the wiki lives, and the features added in the design round. Copy the epics into GitHub as written: one issue per line.

## Board: GitHub Projects

Use GitHub Projects rather than Notion. The issues sit next to the code, a pull request that says `Closes #123` moves its task to Done on merge, and a recruiter who opens the repo can see the board and the history behind each feature. Notion would be a second place to keep in sync by hand.

**Hierarchy.** Sub-issues give you Epic → Feature → Task: open the epic, add features as sub-issues, then add tasks under each feature. The board shows each item's parent and a progress bar for how many children are closed.

**Issue types.** Native Epic, Feature and Task types only exist on organisation-owned repos. Either move the repo into a free organisation (repo URL changes; GitHub redirects the old one), or keep it on your account and use labels `type:epic`, `type:feature`, `type:task`. The board works the same either way.

**Fields to add to the project:**

| Field | Type | Values |
| --- | --- | --- |
| Status | Single select | Backlog, Ready, In progress, In review, Done |
| Phase | Single select | 0 Spikes … 9 After launch |
| Area | Single select | firmware, api, web, db, sim, infra, docs, design |
| Size | Single select | S (under 2 h), M (half a day), L (a day or more: split it) |

**Views.** A board of tasks grouped by Status and filtered to the current phase, for daily work. A table grouped by Parent issue, to see each feature's tasks together. A roadmap by Phase, for the big picture.

**Rules.** Turn on the project's built-in workflows: auto-add new issues from the repo, set Done when an issue closes, set In review when a pull request opens. One branch and one pull request per task. A task is done when it is merged with tests, and the docs page it touches is updated in the same pull request.

## Wiki: a docs site in the repo

Keep the wiki as Markdown in the monorepo at `apps/docs`, built with Starlight (Astro's docs theme) and deployed by Cloudflare Pages to `docs.floraflow.<domain>`. Docs change in the same pull request as the code they describe, so they don't drift. GitHub's built-in wiki is a separate repo with no review, and Notion can't render the OpenAPI spec or stay in step with the code.

| Section | What goes in it | How it's made |
| --- | --- | --- |
| Getting started | Clone, env vars, run everything locally with the simulator | Hand-written |
| Architecture | System context, data flow, sequence diagrams for pairing, commands and OTA | Mermaid in Markdown via the astro-mermaid plugin |
| API reference | Every endpoint, request and response | Generated: CI exports `openapi.json` from the Hono app, the starlight-openapi plugin renders it |
| Device protocol | MQTT topics, payload schemas, QoS and retained flags | Hand-written, with the zod schemas linked |
| Database | ERDs, indexes, retention and rollup jobs | Mermaid `erDiagram`, kept next to the Drizzle schema |
| Hardware | Parts list, wiring, flashing, calibration | Hand-written with photos |
| Decisions | One ADR per decision (`docs/adr/0001-mqtt-via-emqx.md`) | Hand-written, short template |
| Runbooks | Rotate a device secret, restore the database, free-tier quota alarms | Hand-written |

The API reference costs nothing to maintain: `@hono/zod-openapi` already describes each route, so the spec is a build output.

## Working with as little AI as possible

- Write each task's issue yourself from this backlog before starting it. Writing the acceptance check is where you plan the code.
- Turn off inline autocomplete in the editor. Use AI in a separate chat for questions ("why does BearSSL need this much heap?") and paste the answer into the ADR in your own words.
- Ask for review once a pull request is ready, not while writing it: paste the diff and ask for bugs, security and missed edge cases. Fix them yourself.
- Keep a `LEARNED.md` or a section in each ADR for what you found out. It shows your reasoning to recruiters.

## Added in this design round

The old repo's TODOs, unused types and stub pages pointed at these features. Each one now has a home in an epic below.

| Feature | Found in | Decision | Epic |
| --- | --- | --- | --- |
| Favourites and a default greenhouse | Old code | Add | E2 |
| Grid customisation: readings shown, order, temperature colour bands, card size | Your list, and the old dashboard layout TODO | Add, saved per user | E4 |
| Search, filter and sort on /greenhouses | Old code (advanced filtering) | Add | E4 |
| Rate limiting | Your list | Add | E2 |
| Profile photo upload | Old code | Add | E2 |
| Name preference ("what should we call you") | Old code (`namePreference`) | Add | E2 |
| Greenhouse health score | Old code | Add as time-in-range over 24 h | E4 |
| Device uptime | Old code | Add, from presence history | E3 |
| Email alerts | Old code | Add for offline alerts only | E6 |
| Bulk edit | Your list | Add | E5 |
| Camera snapshots and time-lapse | Old code | After launch: needs a separate ESP32-CAM board, since the D1 mini can't drive a camera | E9 |
| Plant-care tasks and reminders | Old code (Tasks page stub) | After launch | E9 |
| Reports and growth analytics | Old code (Reports page stub) | After launch | E9 |
| Customisable quick actions | Old code | Fold into grid customisation | E4 |
| Redis cache | Old code note | Skip: in-process lru-cache is enough for one API instance | E9 if needed |
| Plan tiers | Old code | Skip: no paid plans | none |

## E0 · Spikes

### Device to broker

- [ ] Flash a test sketch that connects a D1 mini to EMQX Serverless over TLS and publishes once a minute
- [ ] Log free heap before, during and after the TLS handshake; record the numbers
- [ ] Write ADR 0001: MQTT via EMQX, with the heap results

### Broker to API

- [ ] Create an EMQX rule that posts telemetry to a webhook
- [ ] Point it at a local Hono endpoint through a Cloudflare tunnel and check the shared-secret header
- [ ] Publish a command through EMQX's REST API and see the board react

### Logins and jobs

- [ ] Stub the EMQX authentication endpoint and reject an unknown client
- [ ] Create a pg\_cron job on the Supabase free plan that writes a heartbeat row

## E1 · Foundations

### Monorepo

- [ ] Set up pnpm workspaces and Turborepo with `apps/` and `packages/`
- [ ] Add Biome, Vitest and a shared `tsconfig`
- [ ] Create empty `shared`, `db` and `sim-engine` packages with one passing test each

### CI and deploys

- [ ] GitHub Actions: lint, typecheck and test on every pull request
- [ ] Protect `main`: pull requests only, checks must pass
- [ ] Deploy the API to Render and the web app to Cloudflare Pages on merge
- [ ] Serve one Pages build on the app, demo and sim hostnames

### Services

- [ ] Create the Supabase project and run a first Drizzle migration from CI
- [ ] Set up Sentry for the API and the web app
- [ ] Document every environment variable in `.env.example` and the docs site

### Board and docs

- [ ] Create the GitHub Project with the fields and views above
- [ ] Add issue templates for Epic, Feature, Task and Bug
- [ ] Enter this backlog as issues and sub-issues
- [ ] Create `apps/docs` with Starlight and deploy it to `docs.` subdomain
- [ ] Add the ADR template and move ADR 0001 in

### Versioning and releases

- [ ] Conventional Commits, checked by commitlint in CI
- [ ] Stamp the web build with date and commit SHA; show it in Settings and send it to Sentry
- [ ] API health route returns its commit SHA
- [ ] Web app sends an `X-FF-Client` header; the API logs it per request
- [ ] Middleware that adds `Deprecation` and `Sunset` headers to a deprecated API version
- [ ] PWA prompt to reload when a new build is waiting
- [ ] Versioning page on the docs site with the compatibility table

## E2 · Accounts and greenhouses

### Authentication

- [ ] Better Auth with email and password, and email verification through Resend
- [ ] Google and GitHub sign-in
- [ ] Session list with sign-out per device
- [ ] Sign-in and create-account screens, per the design

### Rate limiting

- [ ] Add hono-rate-limiter with an in-memory store, keyed by user or IP
- [ ] Set budgets per route group: strict on auth, looser on reads
- [ ] Return 429 with `Retry-After`, and show the wait time in the UI
- [ ] Tests for the limits and for the reset after the window

### Onboarding

- [ ] First-run stepper: name preference, time zone, units
- [ ] Choice of pair a kit, start a simulated greenhouse, or join by invite
- [ ] Crop presets that fill in target ranges
- [ ] Push-permission step at the end

### Profile and settings

- [ ] Profile form with name, name preference, email and time zone
- [ ] Photo upload to Supabase Storage, resized to 256 px
- [ ] Notification preferences per event and channel, with quiet hours
- [ ] Units, time format, theme and start page
- [ ] Export my data and delete account

### Greenhouses and sharing

- [ ] Greenhouse create, rename, move and delete
- [ ] Favourites and a default greenhouse
- [ ] Memberships with Owner, Editor and Viewer roles, checked in one middleware
- [ ] Invite links that expire, and role changes by the owner

## E3 · Device lifecycle

### Pairing

- [ ] Device generates its secret; register endpoint stores only its SHA-256
- [ ] 8-character pairing code with expiry, shown on the LCD
- [ ] Claim endpoint links the device to a greenhouse
- [ ] Add-greenhouse screen with the pairing steps

### MQTT access

- [ ] EMQX authentication endpoint that checks the device secret
- [ ] Topic ACL so a device can only use `ff/v1/{its id}/…`

### Presence and uptime

- [ ] Last-will message on the status topic; mark devices online and offline
- [ ] Store presence changes and show uptime over 7 and 30 days

### Simulator, first cut

- [ ] Physics model and virtual sensors in `sim-engine`
- [ ] CLI that pairs a virtual device and publishes over real MQTT

## E4 · Telemetry

### Ingest

- [ ] Webhook endpoint that validates with the shared zod schema and inserts in batches
- [ ] Latest-reading cache in lru-cache
- [ ] Indexes on device and time; check query plans

### Live and history

- [ ] Server-sent events stream per user
- [ ] Hourly rollups and 90-day raw retention as pg\_cron jobs
- [ ] Downsampled chart queries; 7-day chart under 200 ms

### Screens

- [ ] Overview and greenhouse detail in the variant G style
- [ ] /greenhouses grid with search, status filter, location filter, sort and grid or list view
- [ ] Remember filters and sort per user

### Grid customisation

- [ ] Pick which readings show on cards and drag to reorder them
- [ ] Edit temperature colour bands
- [ ] Card size: compact or comfortable
- [ ] Save as JSON in user preferences, validated by a zod schema

### Health score

- [ ] Compute time in range per reading over 24 h
- [ ] Show the score on cards and explain it on the detail page

## E5 · Control

### Thresholds and config

- [ ] Settings screen for target ranges and report interval
- [ ] Retained config topic with a version number the device echoes back

### Commands

- [ ] Command endpoint that publishes through EMQX's REST API
- [ ] Ack tracking with a timeout and a visible "applied" state
- [ ] Actuator events stored and shown on the chart

### Schedules

- [ ] Schedule editor for watering, lights and fan
- [ ] Schedules sent in the config; device runs them offline

### Bulk edit

- [ ] Pick several greenhouses; skip ones where you're only a viewer
- [ ] Change only the fields ticked, with a preview of before and after
- [ ] Apply in one transaction and bump each config version

## E6 · Alerts

### Rules

- [ ] Threshold alerts with a minimum duration and hysteresis, so they don't flap
- [ ] Offline alert after 5 minutes, checked by a pg\_cron job
- [ ] Low-tank alert

### Delivery

- [ ] In-app alert list with acknowledge and resolve
- [ ] Web push with VAPID keys and a service worker
- [ ] Offline alerts by email through Resend
- [ ] Respect quiet hours, except for critical alerts

## E7 · Real firmware

### Sensors and control

- [ ] Drivers for each sensor, with calibration values in config
- [ ] Port the control loop and run the shared JSON test vectors on the board

### Setup and resilience

- [ ] Captive portal for Wi-Fi setup
- [ ] Offline buffer that sends missed readings on reconnect

### OTA updates

- [ ] Upload firmware builds to Supabase Storage from CI
- [ ] Dashboard sends the device a signed URL; device checks the hash before flashing
- [ ] Roll back if the new build doesn't report within 2 minutes
- [ ] Set the firmware version from the git tag in a PlatformIO pre-build script
- [ ] Beta and stable channels, with a promote button in the dashboard
- [ ] Server accepts every payload `v` still in use, based on each device's reported firmware

### Hardware docs

- [ ] Parts list, wiring diagram and flashing guide on the docs site

## E8 · Portfolio polish

### Simulator and demo

- [ ] Sim host inside the API running virtual devices
- [ ] Sim panel at `sim.` subdomain for changing the environment
- [ ] Demo at `demo.` subdomain with the free-quota cut-off

### Public pages and exports

- [ ] Landing page, per the design
- [ ] CSV export for any greenhouse and date range

### Write-up

- [ ] README with the architecture diagram and a short demo video
- [ ] Docs site complete: architecture, API reference, protocol, runbooks

## E9 · After launch

### Cameras

- [ ] ESP32-CAM firmware that uploads a JPEG snapshot to a signed URL on a timer
- [ ] Pair cameras like other devices and link them to a greenhouse
- [ ] 30-day snapshot retention as a pg\_cron job
- [ ] Camera screen with snapshot history and a 7-day time-lapse

### Later

- [ ] Plant-care tasks and reminders
- [ ] Reports and growth analytics
- [ ] Mobile app with Expo
- [ ] Shared cache such as Redis, only if the API runs on more than one instance
