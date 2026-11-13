# Simulator and demo

## How it works

A simulated greenhouse is a virtual device that speaks the same MQTT protocol as the D1 mini, with a physics model where the real plants and air would be. The dashboard can't tell the difference.

&#91;embedded content: Virtual device · 5 layers inside the API's Sim host\]

The arrow on the right of the stack is the feedback loop: the controller's vent, light and pump decisions change the physics on the next tick. Only the controller layer is shared logic with the firmware; the others stand in for the real world.

## Subdomains and where the sim runs

Virtual devices run on the server, not in the browser, so a demo greenhouse keeps reporting when nobody is watching. The sim panel only changes the weather and watches.

| Subdomain | Serves | Hosted on |
| --- | --- | --- |
| `floraflow.<domain>` | The dashboard app | Cloudflare Pages |
| `demo.floraflow.<domain>` | Split-screen demo: dashboard and sim panel side by side, anonymous sign-in | Same Pages project, chosen by hostname |
| `sim.floraflow.<domain>` | Sim panel: create and drive virtual greenhouses | Same Pages project, chosen by hostname |
| `api.floraflow.<domain>` | API, including the Sim host | Render |

- **One build, three front doors.** `apps/web` is deployed once to one Pages project with three custom domains. The router picks the root layout from `location.hostname`. Sim code is lazy-loaded, so the main app doesn't download it. One session cookie on `.floraflow.<domain>` covers all three.
- **Sim host.** A service inside the API process runs each virtual device as an `mqtt.js` client with its own EMQX login, exactly like a board. Its messages go through EMQX and back through the webhook like any real device's.
- **One engine, three users.** `packages/sim-engine` (pure TypeScript, deterministic) runs in the Sim host, in `apps/simulator` for local dev and load tests, and offline to backfill history.

## Physics model

A simple step model, ticking once a second, that reacts the way a small greenhouse does: sun heats it, the vent cools it, plants dry the soil and the pump wets it.

| Quantity | Goes up with | Goes down with |
| --- | --- | --- |
| Air temperature | Sunlight; outside temperature when warmer | Vent opening (scaled by % open), door, outside temperature when colder |
| Humidity | Plant transpiration (more in warm light), watering | Vent and door pulling towards outside humidity |
| Soil moisture | Pump running | Evaporation: temperature × light × the drying-rate slider |
| Water tank | Refill button | Pump running |
| Light (lux) | Sunlight × (1 − cloud cover), grow light | Night, clouds |
| CO₂ | Plant respiration in the dark, a closed greenhouse at night | Photosynthesis in light; vent and door pulling towards outside CO₂ |

Temperature step, as an example of the shape every quantity follows:

```latex
T_{t+1} = T_t + \Delta t\,\big(k_{wall}(T_{out} - T_t) + k_{sun}\,S_t - k_{vent}\,v_t\,(T_t - T_{out})\big)
```

Here S is sunlight (0 to 1) and v is vent opening (0 to 1). Constants live in `packages/sim-engine/src/constants.ts`. Tune them so a sunny afternoon with the vent shut climbs about 1 °C every few minutes: fast enough to see in a demo, slow enough to look real.

Sensors sit on top of the physics with realistic noise and resolution. Soil and water go through the same raw-ADC-to-% calibration as the firmware, so calibration bugs show up here too.

## Sim panel controls

You control the weather and the hardware; the device decides what to do about it, exactly as a real one would.

| Control | Range | What it changes |
| --- | --- | --- |
| Outside temperature | −10 to 40 °C | Heat loss and gain through walls and vent |
| Outside humidity | 0–100% | What venting pulls humidity towards |
| Sunlight | 0–100% (0 = night) | Heat, light, photosynthesis |
| Cloud cover | 0–100% | Cuts sunlight |
| Outside CO₂ | 350–1,000 ppm | What venting pulls CO₂ towards |
| Soil drying rate | 0.25× to 4× | How fast plants use water |
| Door | Open / closed | Large, fast air exchange |
| Water tank | Refill / drain | Whether the pump has water |

**Presets:** Heatwave · Cold night · Forgot to water · Sealed overnight (CO₂ builds up) · Empty tank.

**Faults:** each sensor can be OK, failed (reads NaN), stuck or noisy. Plus: drop Wi-Fi (device goes offline, buffers, resends later), reboot, and factory reset (back to pairing, with a code on the virtual LCD).

**What the panel shows:**

- A virtual 16×2 LCD with the exact text the firmware would show.
- Actuators with their reason: Auto, Schedule, or Manual until a time.
- The physics truth next to what the sensors report, so faults are visible.
- An MQTT log: config and commands coming in; telemetry, state and acks going out, each with its JSON.
- The config version and schedules the device has received.

## Demo flow on demo.floraflow

Each visitor gets their own simulated greenhouse, so one person's heatwave never spoils another's demo.

1. A visitor opens `demo.floraflow.<domain>` and clicks Start demo. They're signed in anonymously.
2. The API creates their own virtual device and greenhouse, registers and claims it automatically, and backfills 24 hours of history by running the engine fast through 1,440 steps. Charts are never empty.
3. The screen splits: dashboard on the left, sim panel on the right (stacked on a phone).
4. Guided steps walk through the system:
   1. "Make it a heatwave": the vent opens within a control tick and the dashboard shows it as Auto.
   2. "Forget to water": soil drops, the pump runs, the tank level falls.
   3. "Override the light for 30 minutes" from the dashboard: the command appears in the sim's MQTT log and on its LCD.
   4. "Pull the Wi-Fi": the dashboard shows offline; on reconnect the buffered readings fill the gap.
5. While the tab is open, the device reports every 10 s instead of 60 s, so the dashboard keeps up.
6. Two shared, always-on demo greenhouses show months of history for the long-range charts. Visitors can view them but not change them.
7. After 24 hours, the anonymous user, their greenhouse and their virtual device are deleted.

## Fidelity

The sim is only useful if it behaves like the board, so the control logic is shared by test, not by trust.

| Area | Same as a real device? |
| --- | --- |
| MQTT topics, payloads, QoS, retained config, last will | Yes: built from `@floraflow/shared` schemas |
| Registration, pairing code, claim | Yes: same endpoints; the code appears on the virtual LCD |
| Control rules (hysteresis, schedules, overrides, failsafes) | Yes: `sim-engine/controller.ts` is a port of `control.cpp`, and both run the same JSON test vectors (`firmware/test/vectors/*.json`) in CI |
| Offline buffer and resend | Yes |
| Command acks, override expiry | Yes |
| OTA | Partly: accepts the command, waits, reports the new version; no real binary |
| Wi-Fi signal (RSSI), heap, TLS limits | No: realistic made-up values |

**Stretch goal:** compile `control.cpp` to WebAssembly with Emscripten and run the firmware's own logic in the sim, so there is nothing to port at all.

## API, schemas, data and limits

**Endpoints** (owner of the virtual device only):

| Method and path | Does |
| --- | --- |
| `GET /v1/sim/devices` | Your virtual devices |
| `POST /v1/sim/devices` | Create one (limit 1 per user): registers, claims into a new greenhouse, backfills 24 h |
| `PATCH /v1/sim/devices/:id/environment` | Change any `SimEnvironment` fields |
| `PATCH /v1/sim/devices/:id/faults` | Change sensor faults and Wi-Fi |
| `POST /v1/sim/devices/:id/actions` | Preset, refill tank, reboot, factory reset |
| `POST /v1/sim/devices/:id/start`, `/stop` | Run or pause it |
| `GET /v1/sim/devices/:id/stream` | SSE: physics snapshot at 1 Hz, LCD text, MQTT log |

**Schemas** (in `packages/shared/src/sim.ts`):

```ts
export const SimEnvironment = z.object({
  outsideTempC: z.number().min(-10).max(40),
  outsideHumidityPct: pct,
  sunPct: pct,
  cloudPct: pct,
  outsideCo2Ppm: z.number().int().min(350).max(1000),
  soilDryingRate: z.number().min(0.25).max(4),
  doorOpen: z.boolean(),
});

export const SensorFault = z.enum(["ok", "failed", "stuck", "noisy"]);
export const SimFaults = z.object({
  tempHumidity: SensorFault,
  light: SensorFault,
  soil: SensorFault,
  water: SensorFault,
  co2: SensorFault,
  wifiDown: z.boolean(),
});

export const SimAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("preset"), name: z.enum(["heatwave", "coldNight", "forgotToWater", "sealedOvernight", "emptyTank"]) }),
  z.object({ type: z.literal("refillTank") }),
  z.object({ type: z.literal("reboot") }),
  z.object({ type: z.literal("factoryReset") }),
]);

// Streamed to the sim panel at 1 Hz: the physics truth, not the sensor readings
export const SimSnapshot = z.object({
  ts: z.number(),
  airTempC: z.number(),
  humidityPct: pct,
  soilPct: pct,
  lux: z.number(),
  tankPct: pct,
  co2Ppm: z.number(),
  actuators: DeviceState.shape.actuators,
  lcd: z.tuple([z.string().max(16), z.string().max(16)]),
  state: z.enum(["SETUP_WIFI", "REGISTER", "PAIRING", "RUNNING", "OFFLINE", "OTA"]),
});

export const SimLogEntry = z.object({
  ts: z.number(),
  dir: z.enum(["in", "out"]),
  topic: z.string(),
  payload: z.unknown(),
});
```

**Data:** `devices.kind` (`physical` or `simulated`) and a `sim_devices` table: owner, encrypted MQTT secret, environment, faults, a physics snapshot saved every minute so a Render restart resumes where it left off, and when it should stop. The secret is AES-GCM encrypted with a new env var, `SIM_SECRET_KEY`, because the Sim host must reconnect after restarts. See the Database tab.

**Free-tier limits.** Every running virtual device is an MQTT session and a webhook call per report, so:

- The 2 shared demo devices run always, at 60 s: \~88k session minutes and \~88k rule actions a month.
- Visitor and user sims run only while their sim or demo page is open, plus 30 minutes, then stop and show offline.
- At 10 s reporting a watched sim uses 360 rule actions an hour. With \~5 real devices and the 2 shared demo devices, about 690k free rule actions remain: roughly 1,900 visitor-hours a month.
- The API counts webhook calls per month. Past 90% of the free quota, new demo sims stop starting, and visitors get the shared read-only greenhouses instead.
