# Hardware and firmware

## Parts and pin map

Every sensor sits on the I²C bus or the ADS1115, so the D1 mini's single analog pin stays free.

| Function | Part | Bus / pin | Notes |
| --- | --- | --- | --- |
| I²C bus | — | D2 = SDA (GPIO4), D1 = SCL (GPIO5) | Shared by everything below marked I²C |
| Temperature + humidity | SHT31 (or DHT22) | I²C 0x44 | More accurate than the DHT11 |
| Light | BH1750 | I²C 0x23 | Lux; gives daily light received |
| Extra analog inputs | ADS1115 | I²C 0x48 | Four 16-bit inputs |
| Soil moisture | Capacitive probe (v1.2) | ADS1115 A0 | Calibrate dry and wet values per probe |
| Water tank level | Analog level sensor | ADS1115 A1 | Calibrate empty and full |
| CO₂ | SCD40 | I²C 0x62 | Also reports temperature and humidity |
| Display | 16×2 LCD with I²C backpack | I²C 0x27 or 0x3F | Readings, status, pairing code |
| Vent | SG90/MG90S servo | D6 (GPIO12) | Own 5 V supply |
| Grow light | Logic-level MOSFET or relay | D5 (GPIO14) |  |
| Water pump | MOSFET + 5 V pump | D7 (GPIO13) | Own 5 V supply |
| Button | Momentary to GND | D3 (GPIO0) | Hold 5 s: reset Wi-Fi. Hold 15 s: factory reset |

- Keep outputs off D3, D4 and D8: they set the boot mode. The old firmware's grow light on D4 could stop the board booting.
- Power the servo and pump from their own 5 V supply with a shared ground; the D1 mini's regulator can't carry them.
- Don't hold the button while powering on: GPIO0 low at boot enters flash mode.

## Firmware architecture

The device controls the greenhouse on its own; the cloud only sets the rules and sends overrides. If Wi-Fi drops, plants are still looked after.

PlatformIO, Arduino core for ESP8266, C++17. No `delay()` anywhere: one loop runs these tasks on `millis()` timers.

| Task | Every | Does |
| --- | --- | --- |
| Sample sensors | 10 s | Read all sensors, keep a running average; NaN marks a failed read |
| Control | 10 s | Apply thresholds, schedules and manual overrides; switch actuators |
| Telemetry | 60 s (from config) | Publish the averaged reading; buffer it if offline |
| MQTT | Every loop | Keep the connection; reconnect with backoff (1 s doubling to 60 s) |
| LCD | 2 s | Rotate readings, status and pairing code |
| Time | Boot, then 6 h | NTP via `configTime` with the greenhouse's POSIX time zone |

**States:**

| State | Entered when | Behaviour |
| --- | --- | --- |
| `SETUP_WIFI` | No saved Wi-Fi, or button held 5 s | Captive portal hotspot `FloraFlow-XXXX` |
| `REGISTER` | Wi-Fi connected, never registered | HTTPS register call; retries with backoff |
| `PAIRING` | Registered but not claimed | Shows an 8-character code on the LCD; refreshes it every 15 min |
| `RUNNING` | Claimed and connected to EMQX | Normal operation |
| `OFFLINE` | Wi-Fi or MQTT lost | Keeps controlling from saved config; buffers readings |
| `OTA` | `ota` command received | Disconnects MQTT, downloads, verifies, reboots |

**Control rules** (pure C++ in `control.cpp`, unit-tested on your PC):

- **Vent:** opens at `tempC ≥ ventOpenC`, closes at `tempC ≤ ventCloseC` (e.g. 28 / 25 °C). The gap stops it flapping. Humidity above `humidityMaxPct` also opens it, as does CO₂ below co2MinPpm in daylight (plants have used it up).
- **Grow light:** follows schedules; stays off when `lux` is above `luxLightOffAbove`.
- **Pump:** runs `pumpSeconds` when soil drops below `soilMinPct`, at most `pumpMaxPerHour` times an hour.
- **Manual override** wins until it expires, then automatic control resumes.
- **Failsafe:** if the temperature sensor fails, the vent opens and the pump stays off.

**Offline:** config lives in LittleFS, so control keeps running across reboots. Readings go into a RAM ring buffer of 120 (2 hours) and are sent with their original timestamps on reconnect. Duplicates are ignored by the database key.

## Provisioning and pairing

Ownership is proved by physically seeing the device's screen, not by knowing its ID. The ID (`GH-` + MAC in hex) is public.

1. **Wi-Fi.** First boot opens the `FloraFlow-XXXX` hotspot; the user picks their Wi-Fi on a phone.
2. **Secret.** The device generates a 32-byte random secret from the ESP8266 hardware RNG and saves it to LittleFS.
3. **Register.** `POST /v1/devices/register` over HTTPS with `{deviceId, secret, firmwareVersion, hardwareRev}`. The API stores SHA-256 of the secret and creates the device's MQTT login in EMQX: username = device ID, password = secret, allowed topics `ff/v1/{deviceId}/#` only.
4. **Pairing code.** `POST /v1/devices/pairing-code` (authenticated with the secret) returns an 8-character code valid for 15 minutes. The LCD shows it.
5. **Claim.** In the dashboard, Add greenhouse → enter the code → name it. The API links device and greenhouse and marks the code used.
6. **Run.** The device connects to EMQX, receives its retained config and starts reporting.

A register call for an ID that already exists with a different secret gets `409`. Removing the device in the dashboard deletes its row and MQTT login, so it can register again after a factory reset.

## OTA updates

An admin uploads a build once; owners and editors roll it out per greenhouse.

1. Admin uploads a `.bin` in the dashboard. The API stores it in Supabase Storage and records version, size and MD5.
2. An owner or editor clicks Update. The API sends an `ota` command with version, size and MD5.
3. The device disconnects MQTT to free TLS memory, then downloads `GET /v1/devices/firmware/{version}` with `ESP8266httpUpdate`. The API streams the file from Storage and sets the `x-MD5` header, which the updater checks.
4. The device reboots into the new build and reports `fw` in its state message. The API marks the command acked, or failed if the old version comes back.

The D1 mini's 4 MB flash leaves room for a second image, which OTA needs.

## Libraries and risks

| Library | For |
| --- | --- |
| tzapu/WiFiManager | Captive portal |
| knolleary/PubSubClient | MQTT client (raise the buffer to 1 KB for config messages) |
| bblanchon/ArduinoJson 7 | JSON payloads |
| BearSSL, `ESP8266httpUpdate`, LittleFS | Built into the ESP8266 core: TLS, OTA, flash storage |
| adafruit/Adafruit SHT31 | Temperature and humidity |
| claws/BH1750 | Light |
| adafruit/Adafruit ADS1X15 | Analog inputs |
| sensirion/Sensirion I2C SCD4x | CO₂ |
| marcoschwartz/LiquidCrystal\_I2C | LCD |
| Servo (core) | Vent |

**Risks:**

- **TLS memory.** BearSSL takes a big share of the ESP8266's free heap. Never run MQTT and HTTPS at the same time. Phase 0 measures this first. Fallback: an ESP32-C3 board with the same code layout.
- **EMQX certificate.** Pin EMQX's CA certificate in firmware and plan an OTA before it expires.
- **Clock.** Until NTP syncs, telemetry sends `ts: 0` and the API uses its own receive time.
