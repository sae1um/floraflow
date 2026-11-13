# FloraFlow

IoT smart-greenhouse platform: D1 mini firmware, MQTT via EMQX, Hono API, Vite + React web app, simulator, in a pnpm + Turborepo monorepo.

## The plan

The full design lives in `docs/plan/`. Start at `docs/plan/README.md`, then read the file for the area you're working in before answering or reviewing:

- Device or firmware work: `01-hardware-firmware.md` and `02-device-protocol.md`
- Database: `03-database.md`
- API: `04-api.md`
- Web app: `05-web-app.md`
- Simulator or demo: `06-simulator-demo.md`
- Tooling, CI, versioning, tests: `07-engineering.md`

If code and plan disagree, say so rather than silently following either.

## How I want help

I'm writing the code myself. Use AI mainly for answering questions and reviewing code:

- Explain and point to the relevant part of the plan or docs; don't write whole features unless I ask.
- When reviewing, look for bugs, security issues and missed edge cases, and check against the plan.

## Backlog

Work is tracked as GitHub issues (Epic → Feature → Task sub-issues) on the FloraFlow V2 project board. Pull requests reference the task they close.
