# Engineering

## Repo layout and tooling

One new repo, `floraflow`, with every part in it; `packages/shared` is the contract they all build against.

```text
floraflow/
├─ apps/
│  ├─ web/          Vite + React dashboard and landing page
│  ├─ api/          Hono API (Render)
│  └─ simulator/    CLI around sim-engine, for local dev and load tests
├─ packages/
│  ├─ shared/       zod schemas, types, topic helpers, VPD, env schema
│  ├─ db/           Drizzle schema, migrations, seed (demo greenhouses)
│  ├─ sim-engine/   Physics model + controller port for virtual devices
│  └─ tsconfig/     Shared TypeScript configs
├─ firmware/        PlatformIO project for the D1 mini
├─ docs/            ADRs, protocol JSON Schemas, runbooks
├─ docker-compose.yml
├─ .github/workflows/
└─ biome.json · turbo.json · pnpm-workspace.yaml
```

| Tool | For |
| --- | --- |
| pnpm workspaces | Packages and linking |
| Turborepo | Cached `lint`, `typecheck`, `test`, `build` across packages |
| TypeScript (strict) | Everything except firmware |
| Biome | Lint and format in one fast tool |
| Vitest | Tests in every TS package |
| Lefthook | Pre-commit: Biome on staged files |

## Local development

Local dev uses no cloud quota: Postgres and an open-source EMQX run in Docker.

1. `docker compose up -d` starts Postgres 17 and `emqx/emqx` 5 (open source), with the same two rules posting to `http://host.docker.internal:3000`.
2. `pnpm db:migrate && pnpm db:seed` creates the schema, a test user and two demo greenhouses.
3. `pnpm dev` runs the API (`tsx watch`), the web app (Vite) and the simulator (3 fake greenhouses) together through Turborepo.
4. Each app has a `.env.example`; `@floraflow/shared` validates env with zod, so a missing variable fails at boot with its name.

The simulator takes flags such as `--devices 50 --interval 5` for load tests, and `--chaos` to drop connections and send late buffered readings.

Use doppler for secret management.

Doppler environments branches:

- `dev``_``local` local env
- `dev`  cloud env
- `prd` production

## CI/CD and deployment

Every pull request is checked; merges to main migrate the database first, then deploy.

| Workflow | Runs on | Steps |
| --- | --- | --- |
| `ci.yml` | Every PR and push | pnpm install (cached) → `turbo lint typecheck test build` → API integration tests against a Postgres service container |
| `firmware.yml` | Changes under `firmware/` | `pio run -e d1_mini` (build) and `pio test -e native` (control-logic tests) |
| `deploy.yml` | Merge to main | `drizzle-kit migrate` against Supabase → call Render's deploy hook (auto-deploy off, so the API never runs ahead of its schema) |
| Cloudflare Pages | Merge to main | Git integration builds `apps/web` with `turbo build --filter=web`; preview URL on every PR |
| `firmware-release.yml` | Tag `fw-v*` | Build the `.bin`, attach it to a GitHub release for upload in the dashboard |

## Versioning and releases

Four things carry a version, and each changes for a different reason, so each is versioned on its own. The compatibility table at the end ties them together.

| What | Scheme | Where the version lives | Changes when |
| --- | --- | --- | --- |
| HTTP API | Major number in the URL: `/v1` | Route prefix and the OpenAPI spec | Only on a breaking change |
| Device protocol | Major in the topic (`ff/v1/…`) plus `v` in every payload | `packages/shared` schemas | A payload's shape breaks |
| Firmware | SemVer, tagged `fw-v2.1.0` | Build flag, reported as `fw` in the device state | Every release |
| Web app | Build stamp, e.g. `2026.11.12-a1b2c3d` | Injected by Vite at build time | Every deploy |

Internal packages (`shared`, `db`, `sim-engine`) are never published, so they stay at `0.0.0` and are linked with `workspace:*`. Use Conventional Commits (`feat:`, `fix:`, `feat!:` for breaking) with commitlint in CI: it makes breaking changes visible in review and gives GitHub's generated release notes something to work with.

### HTTP API

**Within v1, only add.** New endpoints, new optional request fields, new response fields and new enum values are all fine, and clients must ignore fields they don't know. Anything that would break an existing caller is a breaking change: removing or renaming a field or route, making an optional field required, changing a type or a field's meaning, or tightening validation.

**Prefer a new field over a new version.** Most "breaking" needs can be met by adding: add `tempC` next to an old `temp`, move the web app to it, then drop `temp` once nothing reads it. Only go to v2 when that gets messy, or when the shape of many routes changes at once.

**Going from v1 to v2:**

1. Write an ADR saying what breaks and why it can't be done by adding fields.
2. Mount a second router: `app.route("/v1", v1)` and `app.route("/v2", v2)`. The services and database code underneath are shared; only the route handlers and their zod schemas differ. Routes that don't change are registered on both routers from the same handler.
3. Publish two specs, `/docs/v1` and `/docs/v2`, so the docs site shows both.
4. Move the web app to v2 in the same pull request. The typed client turns every place that breaks into a type error.
5. Mark v1 deprecated: every v1 response gets `Deprecation` and `Sunset` headers and a `Link` to the migration page. Log v1 calls by client so you can see who still uses it.
6. Delete v1 after the sunset date once those logs show no traffic. In practice only the mobile app makes this wait, since old installs keep calling v1 until people update.

**Clients say who they are.** The web app and mobile app send `X-FF-Client: web/2026.11.12-a1b2c3d` (or `ios/1.4.0`). `GET /v1/meta` returns the oldest supported mobile version; the API answers `426 Upgrade Required` to anything older, and the app shows an update prompt.

**Deploys never break running clients.** The API and web app deploy separately, and open browser tabs keep running old code, so every change must work with the previous version of the other side for a while. Database changes follow expand and contract: add the new column, deploy code that writes both and reads the new one, backfill, then drop the old column in a later release. `deploy.yml` already migrates before deploying, so each migration must work with the API version that is still running.

### Device protocol

Devices can't be updated as quickly as a browser tab, so the server must keep understanding old firmware for months.

- **Adding a field** is not breaking. The server's zod objects drop unknown keys, and the firmware ignores unknown JSON keys, so either side can add fields first.
- **Breaking a payload** bumps its `v` to 2. The server parses with a union on `v` and accepts both until no device reports firmware older than the one that introduced v2. The config sent to each device matches what it understands, worked out from the `fw` it last reported.
- **Changing the topic layout** moves to `ff/v2/…`. The EMQX rule listens on `ff/+/+/telemetry`, so both run side by side. This should be rare.

### Firmware

- **SemVer.** Major: needs a protocol bump, re-pairing or new wiring. Minor: a new feature or sensor. Patch: a fix.
- **One source for the number.** A PlatformIO pre-build script reads the git tag and passes `-DFW_VERSION="2.1.0"`. Untagged local builds report `2.1.0-dev+a1b2c3d`.
- **Release flow.** Merge to `main`, tag `fw-v2.1.0`, and `firmware-release.yml` builds the `.bin`, computes its MD5, attaches both to a GitHub release, uploads the build to Supabase Storage and registers it through the API with a CI token. Each `firmware` row stores the version, size, MD5, channel and the oldest version it can be installed over.
- **Channels.** New builds go to `beta` first: your own greenhouse and the simulator. Promote to `stable` after 48 hours without problems. The dashboard offers an update when a device is behind the newest build in its channel.
- **Safe updates.** The device checks the MD5 before switching, and rolls back to the previous image if the new one doesn't report within 2 minutes of booting. Rolling back on purpose is just an OTA to the previous version.

### Web app

Nothing depends on the web app's version, so it has no SemVer. Every deploy gets a build stamp (date plus short commit SHA), injected with Vite's `define` as `__APP_VERSION__`.

- It shows at the bottom of Settings, is sent to Sentry as the release, and goes in the `X-FF-Client` header.
- The API's health route returns its own commit SHA, so you can tell which build of each side is live.
- vite-plugin-pwa runs in prompt mode: when a new build is waiting, the app shows "New version available" with a Reload button instead of reloading on its own. A `426` from the API shows the same prompt.
- Cloudflare Pages keeps every deploy, so rolling back is choosing an earlier one in its dashboard.

### Compatibility

| Web app | API | Device protocol | Firmware |
| --- | --- | --- | --- |
| Every build | `/v1` | v1 | 2.x |

Add a row whenever any column moves to a new major, and keep this table on the docs site's Versioning page.

## Testing strategy

Test the logic that would hurt plants or data hardest; skip end-to-end browser tests for now.

| Layer | What | Tool |
| --- | --- | --- |
| `shared` | Schema edge cases, VPD, schedule masks | Vitest |
| API unit | Alert evaluation, downsampling, role checks, pairing code expiry | Vitest |
| API integration | Routes against real Postgres; ingest through a fake EMQX webhook; command round trip | Vitest + `app.request()` |
| Contract | Simulator messages and saved firmware payloads all pass the shared schemas | Vitest |
| Firmware | Hysteresis, schedules across midnight, override expiry, failsafes | PlatformIO Unity, native |
| Load | 50 simulated devices at 5 s intervals for 10 min; ingest p95 < 100 ms | Simulator + API metrics |

## Observability and portfolio docs

- **Errors:** Sentry in web and API, releases tagged with the git SHA.
- **Logs:** pino JSON in Render's log stream.
- **Health:** `/health` checks the process and a database ping; point a free uptime monitor at it.
- **Device health:** signal strength, uptime, free heap and firmware on each greenhouse's device panel.
- **README:** the architecture diagram, a demo link, a short GIF of an override landing on a real device, and how to run it locally in three commands.
- **ADRs** in `docs/adr/`, one per decision: Supabase vs Neon, EMQX vs HiveMQ, MQTT vs HTTP polling, Better Auth vs Clerk, Render vs Workers. The Alternatives table on the Overview tab is the starting point.
- **Protocol docs:** JSON Schemas exported from `packages/shared` into `docs/protocol/` on every build.
