# Device protocol

## MQTT topics

Six topics per device, all under `ff/v1/{deviceId}/`. The `v1` lets a future protocol run alongside this one.

| Topic | Direction | QoS, retained | Payload |
| --- | --- | --- | --- |
| `ff/v1/{id}/telemetry` | Device → cloud | 1 | `Telemetry`, every 60 s |
| `ff/v1/{id}/state` | Device → cloud | 1 | `DeviceState`, on connect and on every change |
| `ff/v1/{id}/cmd` | Cloud → device | 1 | `Command` |
| `ff/v1/{id}/cmd/ack` | Device → cloud | 1 | `CommandAck` |
| `ff/v1/{id}/config` | Cloud → device | 1, retained | `DeviceConfig`; delivered again on every reconnect |
| `ff/v1/{id}/status` | Device + last will | 1, retained | `"online"` / `"offline"` |

EMQX access rules: a device may publish only to its own `telemetry`, `state`, `cmd/ack` and `status`, and subscribe only to its own `cmd` and `config`.

## EMQX rules and REST

Two rules forward everything the API needs; the free plan allows 4 rules, 4 actions and 2 connectors.

- **Connector:** one HTTP server connector to `https://api.floraflow.<domain>`, header `Authorization: Bearer ${EMQX_WEBHOOK_SECRET}`.
- **Rule 1, device messages** → `POST /internal/mqtt/messages`
- **Rule 2, connect/disconnect events** → `POST /internal/mqtt/events`

```sql
-- Rule 1
SELECT clientid, topic, payload, timestamp
FROM "ff/v1/+/telemetry", "ff/v1/+/state", "ff/v1/+/cmd/ack"

-- Rule 2
SELECT clientid, event, timestamp, reason
FROM "$events/client_connected", "$events/client_disconnected"
```

Request body template for Rule 1 (payloads are always JSON, so `${payload}` goes in unquoted; confirm this in phase 0):

```json
{ "clientId": "${clientid}", "topic": "${topic}", "ts": ${timestamp}, "payload": ${payload} }
```

**From the API to EMQX** (REST, Basic auth with the deployment's App ID and App Secret):

- `POST /publish`: commands and retained config.
- Authentication management API: create and delete each device's MQTT login and topic rules.

## Zod schemas

These live in `packages/shared/src/protocol.ts` and are the single source of truth. The API validates every webhook with them, the simulator builds its messages from them, and `z.toJSONSchema()` exports them to `docs/protocol/` for the firmware.

```ts
import { z } from "zod"; // zod v4

export const DeviceId = z.string().regex(/^GH-[0-9A-F]{12}$/);
export const Actuator = z.enum(["vent", "light", "pump"]);
export type Actuator = z.infer<typeof Actuator>;

const pct = z.number().min(0).max(100);
const unixS = z.number().int().nonnegative(); // 0 = clock not synced yet
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// Device -> cloud, every telemetryIntervalS
export const Telemetry = z.object({
  v: z.literal(1),
  seq: z.number().int().nonnegative(),
  ts: unixS,
  tempC: z.number().min(-40).max(85).nullable(),
  humidityPct: pct.nullable(),
  soilPct: pct.nullable(),
  lux: z.number().min(0).max(120_000).nullable(),
  waterPct: pct.nullable(),
  co2Ppm: z.number().int().min(0).max(10_000).nullable(),
  rssi: z.number().int().min(-120).max(0),
  uptimeS: z.number().int().nonnegative(),
  freeHeap: z.number().int().nonnegative(),
});
export type Telemetry = z.infer<typeof Telemetry>;

// Device -> cloud, on connect and on any change
export const DeviceState = z.object({
  v: z.literal(1),
  ts: unixS,
  fw: z.string(), // semver, e.g. "2.0.3"
  configVersion: z.number().int().nonnegative(),
  actuators: z.object({
    vent: z.number().int().min(0).max(100), // % open
    light: z.boolean(),
    pump: z.boolean(),
  }),
  overrides: z.array(z.object({ actuator: Actuator, untilTs: unixS })),
  reason: z.enum(["boot", "change", "config", "command"]),
});

export const Thresholds = z
  .object({
    ventOpenC: z.number().min(0).max(50),
    ventCloseC: z.number().min(0).max(50),
    humidityMaxPct: pct,
    soilMinPct: pct,
    pumpSeconds: z.number().int().min(1).max(120),
    pumpMaxPerHour: z.number().int().min(0).max(10),
    luxLightOffAbove: z.number().min(0),
    waterLowPct: pct,
    co2MinPpm: z.number().int().min(200).max(2000),
  })
  .refine((t) => t.ventCloseC < t.ventOpenC, {
    message: "Close temperature must be below open temperature",
    path: ["ventCloseC"],
  });
export type Thresholds = z.infer<typeof Thresholds>;

export const Schedule = z.object({
  id: z.uuid(),
  actuator: Actuator,
  start: hhmm,
  end: hhmm,
  days: z.array(z.number().int().min(0).max(6)).min(1), // 0 = Sunday
  enabled: z.boolean(),
});

// Cloud -> device, retained on ff/v1/{id}/config
export const DeviceConfig = z.object({
  v: z.literal(1),
  version: z.number().int().positive(),
  tz: z.string(), // POSIX TZ, e.g. "GMT0BST,M3.5.0/1,M10.5.0"
  telemetryIntervalS: z.number().int().min(10).max(600), // 60 normally, 10 while a demo is watched
  thresholds: Thresholds,
  schedules: z.array(Schedule).max(16),
});

// Cloud -> device, ff/v1/{id}/cmd
const cmd = { v: z.literal(1), id: z.uuid(), expiresTs: unixS };
export const Command = z.discriminatedUnion("type", [
  z.object({
    ...cmd,
    type: z.literal("setActuator"),
    actuator: Actuator,
    value: z.union([z.boolean(), z.number().int().min(0).max(100)]),
    durationS: z.number().int().min(60).max(86_400),
  }),
  z.object({ ...cmd, type: z.literal("clearOverride"), actuator: Actuator }),
  z.object({
    ...cmd,
    type: z.literal("ota"),
    version: z.string(),
    sizeBytes: z.number().int().positive(),
    md5: z.string().length(32),
  }),
  z.object({ ...cmd, type: z.literal("reboot") }),
  z.object({ ...cmd, type: z.literal("identify") }), // flash the LCD backlight
]);
export type Command = z.infer<typeof Command>;

export const CommandAck = z.object({
  v: z.literal(1),
  id: z.uuid(),
  ok: z.boolean(),
  error: z.string().max(120).optional(),
});

// EMQX -> API webhook envelopes
export const MqttMessageHook = z.object({
  clientId: DeviceId,
  topic: z.string(),
  ts: z.number(), // ms, broker time
  payload: z.unknown(), // parsed again by topic below
});
export const MqttEventHook = z.object({
  clientid: DeviceId,
  event: z.enum(["client.connected", "client.disconnected"]),
  timestamp: z.number(),
  reason: z.string().optional(),
});

export const topics = {
  telemetry: (id: string) => `ff/v1/${id}/telemetry`,
  state: (id: string) => `ff/v1/${id}/state`,
  cmd: (id: string) => `ff/v1/${id}/cmd`,
  cmdAck: (id: string) => `ff/v1/${id}/cmd/ack`,
  config: (id: string) => `ff/v1/${id}/config`,
  status: (id: string) => `ff/v1/${id}/status`,
} as const;
```

The same package also holds the API request/response schemas (e.g. `CreateCommandBody`, `ReadingsQuery`), the env schema, and pure helpers: VPD from temperature and humidity, unit formatting, schedule-mask conversion.

## Message flows

### Telemetry (every 60 s)

1. Device publishes `Telemetry` (QoS 1).
2. EMQX Rule 1 posts it to `/internal/mqtt/messages`.
3. API checks the webhook secret, parses with zod, looks up the device (cached) and drops it if unclaimed.
4. Inserts into `readings` (`ON CONFLICT DO NOTHING`, so resent buffered readings are harmless), upserts `latest_readings`, updates `devices.last_seen_at`.
5. Evaluates thresholds: opens or resolves alerts and sends web push for new ones.
6. Publishes to the greenhouse's SSE channel and returns `204`.

### Manual override (target: under 3 s end to end)

1. An editor taps "Open vent for 30 min" → `POST /v1/greenhouses/{id}/commands`.
2. API stores the command as `pending`, publishes it to `cmd` via EMQX REST, sets it to `sent`.
3. Device applies it and publishes `CommandAck`, then `DeviceState` with the new override.
4. Webhook → command `acked`, an `actuator_events` row, an SSE update. The button turns from "Sending…" to "Open until 14:30".
5. No ack within 30 s → `failed`; the UI offers a retry.

### Config change

1. An owner or editor saves thresholds or schedules → the settings `version` goes up by one.
2. API publishes `DeviceConfig` retained on `config`.
3. Device applies it, saves it to LittleFS and reports `configVersion` in its state. The UI shows "Synced" when the versions match.

### Online and offline

- The device's last will is `status = "offline"` (retained); it publishes `"online"` when it connects.
- EMQX Rule 2 posts connect and disconnect events → `devices.online` changes and an SSE update goes out.
- A device-offline alert opens after 5 minutes disconnected, so a quick reboot doesn't page anyone.
