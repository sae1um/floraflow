# Web app

## Routes and pages

The app opens on what needs attention, not on a list of everything.

| Route | Page | Shows |
| --- | --- | --- |
| `/` | Landing (own small bundle) | Pitch, "Try the demo", architecture diagram, GitHub link |
| `/login`, `/register` | Auth | Email/password, GitHub, Google |
| `/demo` | Demo entry | Anonymous sign-in, then the app |
| `/app` | Overview | Greenhouses needing attention first (open alerts, offline), then cards with live readings |
| `/app/greenhouses/$id` | Detail | Live tiles (temperature, humidity, VPD, soil, light, water, CO₂), actuator controls with override durations, chart with range picker (24 h / 7 d / 30 d / 90 d / 1 y), actuator timeline under the chart, alerts |
| `/app/greenhouses/$id/settings` | Settings | Thresholds with a hysteresis preview, schedules, members and invite links, device info and firmware update, delete |
| `/app/add` | Add greenhouse | Enter pairing code → name it → done |
| `/app/alerts` | Alerts | All alerts, filter by status and severity |
| `/app/settings` | Account | Profile, enable push, sessions |
| `/app/admin/firmware` | Admin | Upload builds, see rollout status |
| `/invite/$token` | Invite | Accept and join |

On `demo.` and `sim.` hosts the same app mounts different root layouts: the split-screen demo and the sim panel. Their routes are on the Simulator & demo tab.

## Data fetching and live updates

One typed client, one live stream; the server pushes changes into the query cache instead of the app polling.

- **Client:** Hono's `hc<AppType>` gives typed calls, wrapped in TanStack Query.
- **Route loaders:** TanStack Router loaders call `queryClient.ensureQueryData`, so pages render with data on navigation.
- **Search params:** the chart range lives in the URL (`?range=7d`), validated with zod, so links share the exact view.

| Query key | Stale time | Updated by |
| --- | --- | --- |
| `['greenhouses']` | 30 s | SSE `reading`, `device`, `alert` |
| `['greenhouse', id]` | 30 s | SSE `actuator`, `device` |
| `['readings', id, range]` | 30 s (24 h) / 5 min (longer) | SSE `reading` appends to the 24 h series |
| `['alerts', filter]` | 30 s | SSE `alert` invalidates |
| `['settings', id]` | Until a mutation | Mutations |

- **SSE:** one `EventSource` per tab for the greenhouses on screen; events go into the cache with `setQueryData`.
- **Overrides:** the button shows "Sending…" at once, flips to "Open until 14:30" when the `command` event says acked, and rolls back with a toast on failure.

## UX rules

- **Status comes from thresholds**, with the reason shown: "Attention · Soil 18%, below 25%".
- **Trends are absolute changes:** "+1.2 °C in 1 h", never a percentage.
- **"Live" only means live:** shown when the last reading is under 2 minutes old; otherwise "Last seen 14 min ago".
- **Every actuator shows why it's in its state:** Auto, Schedule, or "Manual until 14:30".
- **Viewers see controls disabled**, with a tooltip saying who can change them.
- **Mobile first:** the overview and detail pages work one-handed on a phone; dark mode comes from the design tokens.

## Performance budget, PWA and web push

| Target | Budget |
| --- | --- |
| Landing page JS | < 100 KB gzipped |
| App shell JS | < 250 KB gzipped; charts and settings load lazily |
| Points per chart series | ≤ 300 (downsampled by the API) |
| Largest contentful paint | < 2.5 s on 4G |
| Live update to screen | < 1 s after the webhook arrives |

- Turn chart animations off for live series; keep `motion` for page transitions only.
- **PWA:** `vite-plugin-pwa` in `injectManifest` mode; the service worker handles `push` and `notificationclick` (opens the greenhouse).
- **Push permission** is asked from Settings or after the first alert, never on page load.
- **iPhone:** web push only works once the app is added to the Home Screen; the Settings page says so.

## Packages

| Package | For |
| --- | --- |
| `react`, `react-dom`, `vite`, `@vitejs/plugin-react` | App and build |
| `@tanstack/react-router`, `@tanstack/router-plugin` | File-based, type-safe routes |
| `@tanstack/react-query` | Server state |
| `hono` (client only) | Typed API calls |
| `better-auth` (React client) | Sessions, sign-in |
| `tailwindcss` v4, shadcn/ui (Radix), `lucide-react` | UI |
| `recharts` (via shadcn charts) | Charts |
| `react-hook-form`, `@hookform/resolvers`, `zod` | Forms with shared schemas |
| `date-fns`, `@date-fns/tz` | Times in the greenhouse's time zone |
| `sonner` | Toasts |
| `vite-plugin-pwa` | Service worker and manifest |
| `@sentry/react` | Error tracking |
| `motion` | Page transitions |
