# 🌡️ MQTT Mock Sensor

[![NPM Version](https://img.shields.io/npm/v/mqtt-mock-sensor?style=flat&color=CB3837&logo=npm)](https://www.npmjs.com/package/mqtt-mock-sensor)
[![NPM Downloads](https://img.shields.io/npm/dt/mqtt-mock-sensor?style=flat&color=28a745)](https://www.npmjs.com/package/mqtt-mock-sensor)
[![CI Testing](https://github.com/thitipongroo/mqtt-mock-sensor/actions/workflows/ci.yml/badge.svg)](https://github.com/thitipongroo/mqtt-mock-sensor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?style=flat&logo=github)](https://github.com/sponsors/thitipongroo)

A zero-config, feature-rich CLI tool and headless Node.js library to mock realistic IoT sensor telemetry and publish to any MQTT broker. Built to accelerate IoT backend development, cloud data pipelines, AI/ML anomaly detection, and end-to-end load testing without physical hardware.

---

### 🎨 Prefer a Visual Web Studio?

Design your sensor fleets visually, preview real-time waveform oscillations, and generate ready-to-run CLI commands in one click using **Pulse SensorLab**:

👉 **[Open Pulse SensorLab Web Studio](https://sensorlab.pulseiot-cloud.com)**  
_(Free open-access visual companion hosted on PulseIoT Cloud)_

---

## ✨ Features

- **🚀 Instant Zero-Config Run:** Start publishing realistic telemetry immediately with a single command or interactive terminal wizard.
- **📊 Dual Schema Architecture:**
    - **Schema v1:** Ultra-fast, lightweight flat JSON schema for standard IoT gateways.
    - **Schema v2:** Structured telemetry with per-metric data quality indicators (`GOOD`, `UNCERTAIN`, `BAD`), engineering units, and edge device diagnostics.
- **🏭 Built-in Domain Presets:** Environmental (`env`), Smart Factory & Power (`industrial`), Air Quality (`air`), and GPS Fleet Tracking (`gps`).
- **🛡️ Built-in Security Hardening:**
    - Built-in **SSRF Protection** guarding against loopback and cloud metadata attacks (requires explicit `--allow-local` for private/local brokers).
    - Mutual TLS (**mTLS**) authentication with client certificates and custom CA roots.
    - Strict protocol validation and prototype-pollution-safe JSON pipelines.
- **⚡ High-Throughput & High-Concurrency:**
    - Self-correcting **DriftCompensatedPacer** ensuring zero interval drift over hours of simulation.
    - Pre-generated payload ring buffers for ultra-low latency stress testing.
    - Independent TCP socket per simulated device or pooled connections.
- **💥 Chaos Engineering & Anomaly Injection:** Inject configurable rates of critical spikes, warning deviations, degraded sensor quality, network jitter, or ungraceful socket drops.
- **🔄 Device Shadow / Digital Twin Sync:** Full bi-directional Device Shadow synchronization and delta reconciliation.
- **📁 Historical CSV Replay:** Replay historical field sensor datasets at real-time pacing.
- **🔑 Dynamic REST Device Enrollment:** Automatically bootstrap device credentials on the fly via REST APIs before publishing.
- **📦 Programmatic & TypeScript Ready:** First-class Node.js programmatic API with bundled TypeScript type definitions (`types/index.d.ts`).
- **🐳 Docker Ready:** Minimal, secure multi-stage Alpine Docker container image included.

---

## 📦 Installation & Quick Start

Run instantly with `npx` (No installation needed):

```bash
npx mqtt-mock-sensor
```

Or install it globally:

```bash
npm install -g mqtt-mock-sensor
```

### 🐳 Run with Docker

```bash
# Build the container image
docker build -t mqtt-mock-sensor .

# Run the simulation container
docker run --rm mqtt-mock-sensor -b mqtts://broker.hivemq.com:8883 --devices 5 -i 1000
```

---

## 🚀 Usage

```bash
mock-sensor [options]
```

Or

```bash
mqtt-mock-sensor [options]
```

Display help and all available CLI arguments:

```bash
mqtt-mock-sensor --help
```

---

## ⚙️ Command-Line Options

| Option                     | Type    | Default                          | Description                                                                                               |
| :------------------------- | :------ | :------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| `-b, --broker <url>`       | string  | `mqtts://broker.hivemq.com:8883` | MQTT Broker URL (supports `mqtt://`, `mqtts://`, `ws://`, `wss://`)                                       |
| `--allow-local`            | boolean | `false`                          | Permit connection to loopback (`localhost`, `127.0.0.1`, `[::1]`) or link-local brokers (SSRF protection) |
| `-t, --topic <topic>`      | string  | `sensor/mock/data`               | Target topic. Supports `{deviceId}` placeholder for dynamic routing                                       |
| `-i, --interval <ms>`      | number  | `2000`                           | Stream interval between messages in milliseconds                                                          |
| `--type <type>`            | string  | `env`                            | Sensor telemetry preset: `env`, `gps`, `power`                                                            |
| `-d, --device-id <id>`     | string  | Auto-generated                   | Static device identifier for session                                                                      |
| `--devices <count>`        | number  | `1`                              | Number of concurrent devices to simulate                                                                  |
| `--schema-version <ver>`   | number  | `1`                              | Telemetry schema version: `1` (flat) or `2` (rich readings with quality & edge metadata)                  |
| `--org-id <uuid>`          | string  | optional                         | Optional organization or namespace UUID                                                                   |
| `--epoch-timestamp`        | boolean | `false`                          | Force numeric Unix epoch milliseconds timestamp (`Date.now()`)                                            |
| `--preset <name>`          | string  | optional                         | Domain presets: `env`, `industrial`, `air`, `gps`                                                         |
| `-q, --qos <0\|1\|2>`      | number  | `0`                              | MQTT Quality of Service level (`0`, `1`, or `2`)                                                          |
| `-r, --retain`             | boolean | `false`                          | Enable MQTT retain message flag                                                                           |
| `--count <n>`              | number  | Unlimited                        | Automatically stop and exit after publishing N messages per device                                        |
| `--duration <sec>`         | number  | Unlimited                        | Stop and exit simulation after specified seconds                                                          |
| `--anomaly-rate <pct>`     | number  | `0`                              | Percentage of messages to inject metric anomalies (`0` - `100`)                                           |
| `--anomaly-type <type>`    | string  | `critical`                       | Anomaly type: `critical`, `warning`, `quality`, or `out-of-bounds`                                        |
| `--independent-clients`    | boolean | `false`                          | Spawn separate TCP/TLS client sockets per device (true concurrency)                                       |
| `--shadow`                 | boolean | `false`                          | Enable bi-directional Device Shadow / Digital Twin synchronization (requires `--org-id`)                  |
| `--enroll-url <url>`       | string  | optional                         | REST API endpoint to bootstrap dynamic MQTT credentials                                                   |
| `--enroll-token <token>`   | string  | optional                         | Single-use device enrollment bootstrap token                                                              |
| `--chaos-jitter <ms>`      | number  | `0`                              | Inject random network latency up to N ms before publishing                                                |
| `--chaos-disconnect <pct>` | number  | `0`                              | Simulate sudden ungraceful TCP network drops (`0` - `100%`)                                               |
| `--template <path>`        | string  | optional                         | Path to a custom JSON template file                                                                       |
| `-u, --username <user>`    | string  | optional                         | Broker authentication username                                                                            |
| `-p, --password <pass>`    | string  | optional                         | Broker authentication password                                                                            |
| `--ca <file>`              | string  | optional                         | Path to custom Root CA certificate                                                                        |
| `--cert <file>`            | string  | optional                         | Path to client certificate (mTLS)                                                                         |
| `--key <file>`             | string  | optional                         | Path to client private key (mTLS)                                                                         |
| `--insecure`               | boolean | `false`                          | Allow self-signed SSL/TLS certificates                                                                    |
| `--ui`                     | boolean | `false`                          | Launch Pulse SensorLab Visual Web Studio preview in browser                                               |
| `--will-topic <topic>`     | string  | optional                         | MQTT Last Will and Testament (LWT) topic (supports `{deviceId}`)                                          |
| `--will-message <msg>`     | string  | Auto                             | Custom LWT payload message (supports `{deviceId}`)                                                        |
| `--will-qos <0\|1\|2>`     | number  | `0`                              | MQTT LWT QoS level (`0`, `1`, or `2`)                                                                     |
| `--will-retain`            | boolean | `false`                          | Enable MQTT LWT retain flag                                                                               |
| `--replay <file>`          | string  | optional                         | Path to CSV file to replay historical sensor telemetry                                                    |
| `--no-replay-loop`         | boolean | `false`                          | Stop publishing after reaching the end of the CSV dataset                                                 |

---

## 💡 Examples

### 1. Connect to HiveMQ Public Sandbox (Instant Zero-Config)

```bash
npx mqtt-mock-sensor --devices 5 -i 1000
```

### 2. Connect to Local Broker (SSRF Safe)

> [!NOTE]  
> Connections to `localhost`, `127.0.0.1`, or link-local IPs require the `--allow-local` flag to prevent inadvertent SSRF vulnerabilities.

```bash
mock-sensor -b mqtt://localhost:1883 --allow-local --devices 10 -i 1000
```

### 3. Authenticated Secure Broker with Domain Preset

```bash
mock-sensor \
  -b mqtts://broker.example.com:8883 \
  -u my-user \
  -p my-password \
  --preset industrial
```

### 4. Fleet Simulation with Dynamic Topic Routing

Simulate 10 independent vehicles publishing to individual telemetry topics:

```bash
mock-sensor \
  --devices 10 \
  --type gps \
  --topic "fleet/vehicles/{deviceId}/telemetry" \
  -i 1000
```

### 5. Anomaly Injection for AI / Data Pipelines

Simulate factory power meters with a 15% rate of extreme anomalies (voltage and vibration spikes):

```bash
mock-sensor \
  --preset industrial \
  --anomaly-rate 15 \
  --anomaly-type critical \
  -i 1000
```

Test alert suppression by injecting degraded sensor data quality:

```bash
mock-sensor \
  --preset env \
  --schema-version 2 \
  --anomaly-rate 20 \
  --anomaly-type quality
```

### 6. Automated CI/CD Smoke Testing

Publish exactly 5 messages per sensor with QoS 1 and exit cleanly with code `0`:

```bash
mock-sensor --devices 2 --count 5 -q 1
```

Or limit execution by duration (e.g., run for 30 seconds):

```bash
mock-sensor --devices 5 --duration 30
```

### 7. Mutual TLS (mTLS) Authentication

Connect securely to AWS IoT Core or private clusters using client certificates:

```bash
mock-sensor \
  -b mqtts://a1b2c3d4e5f6-ats.iot.us-east-1.amazonaws.com:8883 \
  --ca root-CA.crt \
  --cert device.pem.crt \
  --key device.private.key \
  -t "devices/{deviceId}/data"
```

### 8. Custom JSON Template Mode

Define your payload structure in `template.json`:

```json
{
    "sensor_id": "{{deviceId}}",
    "unix_time": {{epochMs}},
    "reading": {{randomFloat}},
    "status_code": {{randomInt}}
}
```

Run with:

```bash
mock-sensor --template ./template.json
```

**Supported Template Placeholders:**

- `{{timestamp}}`: ISO-8601 UTC timestamp string (`2026-10-28T16:24:00.000Z`)
- `{{epochMs}}`: Numeric Unix timestamp in milliseconds (`1793204640000`)
- `{{deviceId}}`: Active device ID (`mock-device-001`)
- `{{randomInt}}`: Random integer between 0 and 99
- `{{randomFloat}}`: Random float with 2 decimal places (`0.00` - `99.99`)

### 9. Interactive Setup Wizard (Beginner-Friendly)

Run without options in an interactive terminal to launch the interactive setup wizard:

```bash
npx mqtt-mock-sensor
```

### 10. Last Will and Testament (LWT) & Chaos Testing

Verify your broker or alerting pipeline detects ungraceful disconnects with an automated LWT message and random connection drops:

```bash
mock-sensor \
  -b mqtts://broker.hivemq.com:8883 \
  --will-topic "devices/{deviceId}/status" \
  --will-message '{"status":"OFFLINE","event":"UNEXPECTED_DISCONNECT"}' \
  --will-qos 1 \
  --will-retain \
  --chaos-disconnect 10 \
  --chaos-jitter 250
```

### 11. Historical Sensor Dataset Replay (CSV)

Replay field sensor logs from CSV files at real-time intervals:

```bash
mock-sensor \
  --replay ./factory_readings.csv \
  --topic "factory/telemetry/{deviceId}" \
  -i 1000
```

---

## 🛡️ Cloud & IoT Platform Integration Guide

`mqtt-mock-sensor` is fully compatible with standard MQTT brokers and major IoT platforms, including AWS IoT Core, Azure IoT Hub, ThingsBoard, EMQX, HiveMQ, and Mosquitto.

### 1. Basic Ingestion (Schema v2)

Publishes rich Schema v2 telemetry directly to device topics (`devices/{deviceId}/telemetry`):

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  --allow-local \
  -d "factory-sensor-01" \
  --topic "devices/{deviceId}/telemetry" \
  --preset env \
  --schema-version 2 \
  --count 10
```

### 2. Testing Alert Engines & Data Quality Filtering

Trigger **CRITICAL** alerts to test notification delivery (Slack, Telegram, Webhook, LINE):

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  --allow-local \
  -d "furnace-sensor-01" \
  --topic "sensors/{deviceId}/telemetry" \
  --preset industrial \
  --anomaly-rate 100 \
  --anomaly-type critical
```

Test **Alert Suppression** by injecting degraded sensor quality (`UNCERTAIN` or `BAD`):

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  --allow-local \
  -d "noisy-sensor-01" \
  --topic "sensors/{deviceId}/telemetry" \
  --preset env \
  --schema-version 2 \
  --anomaly-rate 100 \
  --anomaly-type quality
```

### 3. Negative Testing & Dead Letter Queue (DLQ)

Inject physically impossible values (e.g. Temperature = 250°C) to verify DLQ routing:

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  --allow-local \
  -d "malformed-sensor-01" \
  --topic "sensors/{deviceId}/telemetry" \
  --preset env \
  --anomaly-rate 100 \
  --anomaly-type out-of-bounds \
  --count 1
```

### 4. Bi-directional Device Shadow (Digital Twin) Synchronization

Listens for Delta notifications from the cloud and reconciles runtime state:

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  --allow-local \
  -d "twin-device-01" \
  --org-id "00000000-0000-0000-0000-000000000001" \
  --preset env \
  --shadow \
  -i 3000
```

### 5. High-Scale Concurrency & Chaos Testing

Simulate 20 devices with independent TCP sockets, network latency jitter, and random connection drops:

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  --allow-local \
  --devices 20 \
  --topic "devices/{deviceId}/telemetry" \
  --preset industrial \
  --independent-clients \
  --chaos-jitter 300 \
  --chaos-disconnect 5
```

---

## 💡 Example Outputs

### Schema v1 (Flat JSON Schema)

**1. Environmental (`--type env` / `--preset env`):**

```json
{
    "deviceId": "mock-device-001",
    "timestamp": "2026-10-28T16:24:00.000Z",
    "temperature": 24.51,
    "humidity": 55.23,
    "smokePpm": 0.0
}
```

**2. Industrial & Power (`--type power` / `--preset industrial`):**

```json
{
    "deviceId": "mock-device-001",
    "timestamp": "2026-10-28T16:24:00.000Z",
    "voltage": 220.5,
    "current": 5.2,
    "power": 1146.6
}
```

**3. GPS Fleet Tracking (`--type gps`):**

```json
{
    "deviceId": "mock-device-001",
    "timestamp": "2026-10-28T16:24:00.000Z",
    "latitude": 13.756331,
    "longitude": 100.501762,
    "speed": 65.4
}
```

---

### Schema v2 (Structured Telemetry with Quality & Edge Diagnostics)

**1. Environmental (`--preset env --schema-version 2`):**

```json
{
    "deviceId": "factory-sensor-01",
    "schemaVersion": 2,
    "timestamp": 1793204640000,
    "readings": {
        "TEMPERATURE": { "value": 24.3, "unit": "°C", "quality": "GOOD" },
        "HUMIDITY": { "value": 58.2, "unit": "%RH", "quality": "GOOD" },
        "SMOKE_PPM": { "value": 0.02, "unit": "ppm", "quality": "GOOD" },
        "CO2_PPM": { "value": 465.1, "unit": "ppm", "quality": "GOOD" },
        "PRESSURE": { "value": 1013.4, "unit": "hPa", "quality": "GOOD" }
    },
    "edge": {
        "firmwareVersion": "3.2.0",
        "rssi": -68,
        "batteryPct": 94,
        "uptimeSeconds": 1420,
        "protocol": "MQTT"
    }
}
```

**2. Industrial Factory Equipment (`--preset industrial --schema-version 2`):**

```json
{
    "deviceId": "machine-sensor-01",
    "schemaVersion": 2,
    "timestamp": 1793204640000,
    "readings": {
        "VOLTAGE_V": { "value": 220.4, "unit": "V", "quality": "GOOD" },
        "CURRENT_A": { "value": 5.1, "unit": "A", "quality": "GOOD" },
        "POWER_W": { "value": 1124.0, "unit": "W", "quality": "GOOD" },
        "VIBRATION_G": { "value": 0.045, "unit": "g", "quality": "GOOD" },
        "TEMPERATURE": { "value": 38.6, "unit": "°C", "quality": "GOOD" }
    },
    "edge": {
        "firmwareVersion": "3.2.0",
        "rssi": -62,
        "batteryPct": 98,
        "uptimeSeconds": 3600,
        "protocol": "MQTT"
    }
}
```

**3. Air Quality Monitoring (`--preset air --schema-version 2`):**

```json
{
    "deviceId": "air-monitor-01",
    "schemaVersion": 2,
    "timestamp": 1793204640000,
    "readings": {
        "PM25": { "value": 14.2, "unit": "µg/m³", "quality": "GOOD" },
        "PM10": { "value": 28.5, "unit": "µg/m³", "quality": "GOOD" },
        "VOC_INDEX": { "value": 75.0, "unit": "index", "quality": "GOOD" },
        "CO2_PPM": { "value": 480.0, "unit": "ppm", "quality": "GOOD" },
        "O3_PPB": { "value": 21.3, "unit": "ppb", "quality": "GOOD" }
    },
    "edge": {
        "firmwareVersion": "3.2.0",
        "rssi": -71,
        "batteryPct": 88,
        "uptimeSeconds": 7200,
        "protocol": "MQTT"
    }
}
```

---

## 💻 Programmatic Headless Usage & TypeScript API

`mqtt-mock-sensor` can be embedded directly into automated test suites, backend mock services, or CI/CD pipelines.

Bundled TypeScript declarations are provided automatically via `types/index.d.ts`.

### Generate Telemetry Payloads

```javascript
const { generatePayload } = require('mqtt-mock-sensor');

// Generate Schema v2 telemetry
const v2Json = generatePayload('env', {
    deviceId: 'sensor-101',
    schemaVersion: 2,
    preset: 'industrial',
    anomalyRate: 10,
    anomalyType: 'critical'
});
console.log(JSON.parse(v2Json));

// Generate Schema v1 flat telemetry
const v1Json = generatePayload('gps', {
    deviceId: 'vehicle-42',
    schemaVersion: 1
});
console.log(JSON.parse(v1Json));
```

### Launch Simulation Programmatically

```javascript
const { main } = require('mqtt-mock-sensor');

async function run() {
    // Launch headless simulation
    const runner = await main({
        broker: 'mqtts://broker.hivemq.com:8883',
        devices: 5,
        interval: 1000,
        preset: 'env',
        schemaVersion: 2
    });

    // Let it run for 10 seconds, then gracefully stop
    setTimeout(async () => {
        console.log('Stopping simulation...');
        await runner.stop();
        console.log('Simulation stopped cleanly.');
    }, 10000);
}

run();
```

### Programmatic Component Exports

| Export                               | Type     | Description                                                                 |
| :----------------------------------- | :------- | :-------------------------------------------------------------------------- |
| `generatePayload(type, options)`     | Function | Generates serialized Schema v1 or v2 JSON telemetry                         |
| `SimulationRunner`                   | Class    | Full simulation orchestrator with start/stop lifecycle                      |
| `ClientManager`                      | Class    | Manages pooled or independent MQTT clients, mTLS, and packet queues         |
| `DriftCompensatedPacer`              | Class    | Precision interval runner that automatically cancels event loop clock drift |
| `PreGeneratedPayloadBuffer`          | Class    | High-performance circular payload buffer for high-throughput load tests     |
| `CsvReplayer`                        | Class    | Streaming CSV parser for historical dataset playback                        |
| `ShadowManager`                      | Class    | Digital twin AWS IoT-style shadow delta listener & reported state sync      |
| `enrollDevice(url, devId, token)`    | Function | REST bootstrap client to dynamically acquire MQTT credentials               |
| `validateBrokerUrl(url, allowLocal)` | Function | SSRF-safe URL validator for MQTT/WS schemes                                 |
| `sanitizeObject(obj)`                | Function | Prototype-pollution guard and object deep sanitizer                         |

---

## 🏗️ Architecture & Project Structure

The project adopts a **Pragmatic Modular Architecture** designed for zero-overhead performance, strict separation of concerns, and security isolation:

```text
mqtt-mock-sensor/
├── index.js                     # CLI Entry Point & Primary API Exports
├── types/                       # TypeScript declaration files
│   └── index.d.ts               # Complete type definitions for headless usage
├── src/                         # Modular runtime engine
│   ├── index.js                 # Headless API exports
│   ├── clientManager.js         # MQTT socket management, TLS/mTLS, packet queues
│   ├── runner.js                # Simulation coordinator & lifecycle runner
│   ├── payloadGenerator.js      # Telemetry generator (v1/v2 schemas, anomalies)
│   ├── csvReplayer.js           # Historical sensor CSV replay engine
│   ├── shadowManager.js         # AWS IoT / Cloud Device Shadow sync & reconciliation
│   ├── enrollmentHelper.js      # Dynamic REST bootstrap & credential acquisition
│   ├── wizardHelper.js          # Interactive terminal setup wizard
│   ├── cli/                     # CLI arguments & input validation
│   │   ├── options.js           # Commander CLI options definition
│   │   ├── validator.js         # Options validator & template file loader
│   │   └── uiLauncher.js        # Web studio browser launcher
│   ├── generators/              # Domain telemetry & anomaly generators
│   │   ├── random.js            # Cryptographically secure random helper
│   │   ├── sanitizer.js         # Prototype pollution guard & safe JSON parser
│   │   └── types/               # Reading generators (env, industrial, air, gps, edge)
│   ├── network/                 # Network security, config & buffers
│   │   ├── configBuilder.js     # TLS/mTLS context & LWT config builder
│   │   ├── packetQueue.js       # Offline queuing & backpressure packet buffer
│   │   └── validator.js         # SSRF protection, loopback guard & protocol validator
│   ├── runner/                  # Simulation execution & lifecycle components
│   │   ├── exitChecker.js       # Message count & time limit evaluation
│   │   ├── fleetStarter.js      # Concurrency strategies (pooled vs independent)
│   │   ├── publishLoop.js       # Publishing dispatch & chaos injection loop
│   │   └── shutdownHelper.js    # Graceful teardown & socket disconnects
│   ├── scheduler/               # Timing & high-throughput batching
│   │   ├── pacer.js             # DriftCompensatedPacer (self-correcting interval loop)
│   │   └── payloadBuffer.js     # PreGeneratedPayloadBuffer for high-throughput stress tests
│   └── ui/                      # Terminal formatting & visual banners
│       └── banner.js            # Console banners & simulation status display
├── tests/                       # Jest test suites (83 unit tests across 9 suites)
│   ├── clientManager.test.js    # Client management, mTLS & packet queues
│   ├── csvReplayer.test.js      # CSV replay & looping tests
│   ├── enrollmentHelper.test.js # REST bootstrap enrollment tests
│   ├── payloadGenerator.test.js # Schema v1/v2 & anomaly generation tests
│   ├── performance.test.js      # Pacer drift & payload buffer benchmark tests
│   ├── programmatic.test.js     # Programmatic headless exports & API tests
│   ├── securityAudit.test.js    # SSRF prevention & prototype pollution tests
│   ├── shadowManager.test.js    # Device shadow delta reconciliation tests
│   └── wizardHelper.test.js     # Interactive CLI wizard tests
├── DockerFile                   # Production container build
└── package.json
```

---

## ⚡ Powered by PulseIoT Ecosystem

`mqtt-mock-sensor` is the official open-source telemetry engine powering the **Pulse SensorLab Cloud Runner**.

- Use the **[Free CLI](https://www.npmjs.com/package/mqtt-mock-sensor)** for local mocking and zero-config testing.
- Use **[Pulse SensorLab Web Studio](https://sensorlab.pulseiot-cloud.com)** for visual scenario design, real-time waveform canvas, and fleet deployment.

### 🌐 Need Hosted Cloud Scaling?

While `mqtt-mock-sensor` is 100% free and open-source for local and single-node testing, teams requiring hosted cloud runners (up to 10,000+ concurrent devices) and visual fleet controls can explore:  
👉 **[Pulse SensorLab Pro & Team Cloud Plans](https://pulseiot-cloud.com/#pricing)**

---

## 💖 Corporate Sponsors & Backers

Support open-source IoT tooling! `mqtt-mock-sensor` helps developers, QA engineers, and cloud architects simulate realistic IoT telemetry, load test MQTT brokers, and validate cloud pipelines without physical hardware.

If your organization benefits from `mqtt-mock-sensor`, consider becoming a sponsor to help ensure active maintenance, fast issue turnaround, and continuous feature expansion.

### 🏢 Sponsorship Tiers

| Tier                                  |                                                                                        Sponsor                                                                                        | Benefits & Visibility                                                                                                                                                             |
| :------------------------------------ | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **🥇 Platinum Sponsor**<br/>`$250/mo` | <a href="https://github.com/sponsors/thitipongroo"><img src="https://via.placeholder.com/260x80/1a1e24/ea4aaa?text=+Your+Company+Logo+" alt="Platinum Sponsor Logo" width="220"/></a> | • **Large Logo** prominently displayed at top of README & documentation<br/>• Direct backlink to your website/product<br/>• Priority issue triage & feature request consideration |
| **🥈 Silver Sponsor**<br/>`$100/mo`   |      <a href="https://github.com/sponsors/thitipongroo"><img src="https://via.placeholder.com/200x60/1a1e24/ea4aaa?text=+Your+Logo+" alt="Silver Sponsor Logo" width="160"/></a>      | • **Medium Logo** featured in README & release announcements<br/>• Backlink to your homepage or product page                                                                      |
| **🥉 Bronze / Backer**<br/>`$25/mo`   |            <a href="https://github.com/sponsors/thitipongroo"><img src="https://via.placeholder.com/140x45/1a1e24/ea4aaa?text=+Your+Name+" alt="Backer" width="110"/></a>             | • Recognition in the Backers & Contributors roster<br/>• Profile mention in release notes                                                                                         |

<p align="center">
  <a href="https://github.com/sponsors/thitipongroo">
    <img src="https://img.shields.io/badge/Sponsor_on_GitHub-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsor on GitHub" height="38"/>
  </a>
</p>

> 💬 **Custom Invoicing & Partnerships:** Need corporate invoicing, wire transfers, or custom sponsorship arrangements? Please reach out via [GitHub Sponsors](https://github.com/sponsors/thitipongroo) or open a discussion!

---

## 🧪 Development & Testing

Clone the repository and run the test suite or linter locally:

```bash
# Run the complete test suite (83 unit tests across 9 test suites)
npm test

# Check code style with ESLint
npm run lint

# Format code with Prettier
npm run format
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/thitipongroo/mqtt-mock-sensor/issues).

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/thitipongroo/mqtt-mock-sensor/blob/main/package.json) file for details.
