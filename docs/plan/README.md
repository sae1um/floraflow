# FloraFlow V2 plan

The rebuild plan, exported from the planning doc on 13 November 2026. From now on this folder is the copy to edit: change it in the same pull request as the code it describes.

| File | Covers |
| --- | --- |
| [00-overview.md](00-overview.md) | Decisions, architecture, hosting and free-tier budget, alternatives, build order |
| [01-hardware-firmware.md](01-hardware-firmware.md) | Parts and pin map, firmware states and control rules, pairing, OTA |
| [02-device-protocol.md](02-device-protocol.md) | MQTT topics, EMQX rules, zod schemas, message flows |
| [03-database.md](03-database.md) | Tables, Drizzle schema, indexes, rollups and retention |
| [04-api.md](04-api.md) | Endpoints, auth and roles, caching, jobs, rate limits, env vars |
| [05-web-app.md](05-web-app.md) | Routes, data fetching, UX rules, performance budget, packages |
| [06-simulator-demo.md](06-simulator-demo.md) | Sim host, physics model, sim panel, demo flow, sim API |
| [07-engineering.md](07-engineering.md) | Repo layout, local dev, secrets, CI/CD, versioning, testing |
| [08-backlog-workflow.md](08-backlog-workflow.md) | Board and wiki setup, low-AI workflow, the full backlog |

**Not included:** the five diagrams (system architecture, three ERDs, simulator layers) didn't survive the export. Each shows as an `[embedded content: …]` placeholder. Redraw them as Mermaid when they move to the docs site.

**The live backlog is the GitHub issues and the FloraFlow V2 project board.** The checklist in `08-backlog-workflow.md` is the snapshot they were created from; tick things off on GitHub, not here.

**Placeholders:** `<domain>` stands for the domain that hasn't been bought yet.
