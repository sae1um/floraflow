# FloraFlow

IoT smart-greenhouse platform, rebuilt as V2: D1 mini firmware, MQTT via EMQX, a Hono API, a Vite + React web app and a device simulator, in one pnpm + Turborepo monorepo.

The full design is in [`docs/plan/`](docs/plan/README.md). Work is tracked as GitHub issues on the FloraFlow V2 project board.

## Layout

| Path                  | What                                             |
| --------------------- | ------------------------------------------------ |
| `apps/api`            | Hono API, bundled with tsdown for Render         |
| `apps/web`            | Vite + React dashboard                           |
| `apps/docs`           | Starlight docs site                              |
| `packages/shared`     | zod schemas and types shared by every part       |
| `packages/db`         | Drizzle schema and migrations                    |
| `packages/sim-engine` | Physics model and controller for virtual devices |
| `packages/tsconfig`   | Shared TypeScript configs                        |

## Commands

Needs Node 24+ and pnpm 11.

```sh
pnpm install
pnpm dev        # API, web app and docs together
pnpm test       # Vitest in every package
pnpm typecheck  # tsc --noEmit in every package
pnpm lint       # Biome
pnpm build
```
