# 🌡️ MQTT Mock Sensor

[![NPM Version](https://img.shields.io/npm/v/mqtt-mock-sensor?style=flat&color=CB3837&logo=npm)](https://www.npmjs.com/package/mqtt-mock-sensor)
[![NPM Downloads](https://img.shields.io/npm/dt/mqtt-mock-sensor?style=flat&color=28a745)](https://www.npmjs.com/package/mqtt-mock-sensor)
[![CI Testing](https://github.com/thitipongroo/mqtt-mock-sensor/actions/workflows/ci.yml/badge.svg)](https://github.com/thitipongroo/mqtt-mock-sensor/actions/workflows/ci.yml)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?style=flat&logo=github)](https://github.com/sponsors/thitipongroo)

A zero-config, feature-rich CLI tool to generate and stream realistic mock IoT telemetry data to any MQTT broker. Built to accelerate IoT backend development, cloud data pipelines, and AI/ML anomaly detection testing without physical hardware.

## 📦 Installation & Quick Start

Run instantly with `npx` (No installation needed):

```bash
npx mqtt-mock-sensor
```

Or install it globally:

```bash
npm install -g mqtt-mock-sensor
```

## 🚀 Usage

```bash
mock-sensor [options]
```

Or

```bash
mqtt-mock-sensor [options]
```

```bash
mqtt-mock-sensor --help
```

## ⚙️ Command-Line Options

| Option                   | Type    | Default                        | Description                                                             |
| ------------------------ | ------- | ------------------------------ | ----------------------------------------------------------------------- |
| -b, --broker [url]       | string  | mqtts://broker.hivemq.com:8883 | MQTT Broker URL (Supports mqtt://, mqtts://, ws://, wss://)             |
| -t, --topic [topic]      | string  | sensor/mock/data               | Target topic. Supports {deviceId} placeholder for dynamic routing       |
| -i, --interval [ms]      | number  | 2000                           | Stream interval between messages in milliseconds                        |
| --type < type >          | string  | env                            | Sensor telemetry preset: env, gps, power                                |
| -d, --device-id [id]     | string  | Auto-generated                 | Static device identifier for session                                    |
| --devices [count]        | number  | 1                              | Number of concurrent devices to simulate                                |
| --schema-version [1,2]   | number  | 1                              | Telemetry schema version: 1 (legacy flat) or 2 (Sentinel rich readings) |
| --org-id [uuid]          | string  | optional                       | Organization/Tenant UUID for multi-tenant isolation                     |
| --epoch-timestamp        | boolean | false                          | Force numeric Unix epoch milliseconds timestamp (Date.now())            |
| --preset [name]          | string  | optional                       | Domain presets: [domain]-env, [domain]-industrial, [domain]-air         |
| -q, --qos [0,1,2]        | number  | 0                              | MQTT Quality of Service level                                           |
| -r, --retain             | boolean | false                          | Enable MQTT retain message flag                                         |
| --count [n]              | number  | Unlimited                      | Automatically stop and exit after publishing N messages per device      |
| --anomaly-rate [pct]     | number  | 0                              | Percentage of messages to inject extreme metric anomalies (0-100)       |
| --anomaly-type [type]    | string  | critical                       | Anomaly type: critical, warning, quality, or out-of-bounds.             |
| --independent-clients    | boolean | false                          | Spawn separate TCP/TLS client sockets per device (true concurrency)     |
| --shadow                 | boolean | false                          | Enable bi-directional AWS IoT-style Device Shadow synchronization.      |
| --enroll-url [url]       | string  | optional                       | REST API endpoint to bootstrap dynamic MQTT credentials                 |
| --enroll-token [token]   | string  | optional                       | Single-use device enrollment bootstrap token                            |
| --chaos-jitter [ms].     | number  | 0                              | Inject random network latency up to N ms before publishing              |
| --chaos-disconnect [pct] | number  | 0                              | Simulate sudden ungraceful TCP network drops (0 - 100%)                 |
| --template [path]        | string  | -                              | Path to a custom JSON template file                                     |
| -u, --username [user]    | string  | -                              | Broker authentication username                                          |
| -p, --password [pass]    | string  | -                              | Broker authentication password                                          |
| --ca [file]              | string  | -                              | Path to custom Root CA certificate                                      |
| --cert [file]            | string  | -                              | Path to client certificate (mTLS)                                       |
| --key [file]             | string  | -                              | Path to client private key (mTLS)                                       |
| --insecure               | boolean | false                          | Allow self-signed SSL/TLS certificates                                  |
| --ui                     | boolean | false                          | Preview PulseIoT Visual Web Dashboard & join waitlist                   |
| --will-topic [topic]     | string  | -                              | MQTT Last Will and Testament (LWT) topic (supports {deviceId})          |
| --will-message [msg]     | string  | OFFLINE                        | Custom LWT payload message                                              |
| --will-qos [0,1,2]       | number  | 0                              | MQTT LWT QoS level (0, 1, or 2)                                         |
| --will-retain            | boolean | false                          | Enable MQTT LWT retain flag                                             |
| --replay [path]          | string  | -                              | Path to CSV file to replay historical sensor telemetry                  |
| --no-replay-loop         | boolean | false                          | Stop publishing after reaching the end of the CSV dataset               |

### 💡 Examples

**Connect with Username and Password:**

```bash
mock-sensor -b mqtt://secure-broker.com -u "admin" -p "secret123"
```

**Generate GPS Data:**

```bash
mock-sensor --type gps --topic vehicle/location
```

**Multi-Device Fleet with Dynamic Topics:**

Simulate 5 independent vehicles publishing to their own dynamic sub-topics:

```bash
mock-sensor --devices 5 --type gps --topic "fleet/vehicles/{deviceId}/telemetry"
```

**Anomaly Injection for AI / Data Pipelines:**

Simulate industrial power meters with a 10% anomaly rate (extreme voltage spikes) to test alert pipelines:

```bash
mock-sensor --type power --anomaly-rate 10 -i 1000
```

**Automated CI/CD Smoke Testing:**

Publish exactly 5 messages per sensor with QoS 1 and exit cleanly:

```bash
mock-sensor --devices 2 --count 5 -q 1
```

**Enterprise Mutual TLS (mTLS) Connection:**

Connect securely to AWS IoT Core or private enterprise clusters using client certificates:

```bash
mock-sensor \
  -b mqtts://a1b2c3d4e5f6-ats.iot.us-east-1.amazonaws.com:8883 \
  --ca root-CA.crt \
  --cert device.pem.crt \
  --key device.private.key \
  -t "devices/{deviceId}/data"
```

**Custom JSON Template Mode:**

Define your own payload schema in template.json:

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

- {{timestamp}}: ISO-8601 UTC timestamp (2026-10-12T12:00:00.000Z)

- {{epochMs}}: Unix timestamp in milliseconds (1791811200000)

- {{deviceId}}: Active device ID

- {{randomInt}}: Random integer between 0 - 99

- {{randomFloat}}: Random float with 2 decimal places (0.00 - 99.99)

**Interactive Setup Wizard (Beginner-Friendly):**

Run without any options in an interactive terminal to launch the setup wizard:

```bash
npx mqtt-mock-sensor
```

**MQTT Last Will and Testament (LWT) for Chaos Testing:**

Ensure your broker and alert pipeline detect ungraceful disconnects with an automated LWT message:

```bash
mock-sensor \
  -b mqtts://broker.hivemq.com:8883 \
  --will-topic "tenants/{orgId}/devices/{deviceId}/status" \
  --will-message '{"status":"OFFLINE","event":"UNEXPECTED_DISCONNECT"}' \
  --will-qos 1 \
  --will-retain \
  --chaos-disconnect 10
```

**Historical Sensor Dataset Replay (CSV):**

Replay field sensor logs from CSV files at real-time intervals:

```bash
mock-sensor \
  --replay ./factory_readings.csv \
  --topic "factory/telemetry/{deviceId}" \
  -i 1000
```

### 🛡️ Integration Guide (Example - Sentinel IoT Platform )

mqtt-mock-sensor is fully compatible with Sentinel IoT Platform's Ingestion Engine, Alert Engine, and Device Shadow Service.

**1. Basic Ingestion (Schema v2 + Multi-Tenancy)**

Publishes rich Schema v2 telemetry directly to the tenant's device topic (tenants/{orgId}/devices/{deviceId}/telemetry):

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  -d "factory-sensor-01" \
  --org-id "00000000-0000-0000-0000-000000000001" \
  --preset sentinel-env \
  --schema-version 2 \
  --count 10
```

**2. Testing Sentinel Alerts & Quality Filtering**

Trigger CRITICAL alerts to test notification delivery (Slack, Telegram, LINE):

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  -d "furnace-sensor-01" \
  --org-id "00000000-0000-0000-0000-000000000001" \
  --preset sentinel-industrial \
  --anomaly-rate 100 \
  --anomaly-type critical
```

Test Alert Suppression by injecting degraded sensor data (quality: "UNCERTAIN" / "BAD"):

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  -d "noisy-sensor-01" \
  --preset sentinel-env \
  --org-id "00000000-0000-0000-0000-000000000001" \
  --anomaly-rate 100 \
  --anomaly-type quality
```

**3. Negative Testing & Dead Letter Queue (DLQ)**

Inject physically impossible data (e.g. Temperature = 250°C > TEMP_MAX) to verify DLQ routing to factory/telemetry/dlq:

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  -d "malformed-sensor-01" \
  --preset sentinel-env \
  --org-id "00000000-0000-0000-0000-000000000001" \
  --anomaly-rate 100 \
  --anomaly-type out-of-bounds \
  --count 1
```

**4. Bi-directional Device Shadow (Twin) Synchronization**

Listens for Delta notifications from Sentinel and reconciles runtime state:

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  -d "twin-device-01" \
  --org-id "00000000-0000-0000-0000-000000000001" \
  --preset sentinel-env \
  --shadow \
  -i 3000
```

**5. High-Scale Concurrency & Chaos Testing**

Simulate 20 devices with independent TCP sockets, network latency jitter, and random connection drops:

```bash
mqtt-mock-sensor \
  -b mqtt://localhost:1883 \
  --devices 20 \
  --org-id "00000000-0000-0000-0000-000000000001" \
  --preset sentinel-industrial \
  --independent-clients \
  --chaos-jitter 300 \
  --chaos-disconnect 5
```

## 💡 Example Outputs

Depending on the `--type` flag, the payload will change:

**1. Environment (`--type env`) - _Default_**

```json
📤 Published: {"deviceId":"mock-device-412","timestamp":"2023-10-27T10:00:00.000Z","temperature":"24.51","humidity":"55.23"}
```

**2. GPS / Location (`--type gps`)**

```json
📤 Published: {"deviceId":"mock-device-871","timestamp":"2023-10-27T10:00:02.000Z","latitude":"13.756331","longitude":"100.501762","speed":"65.40"}
```

**3. Power / Energy (`--type power`)**

```json
📤 Published: {"deviceId":"mock-device-109","timestamp":"2023-10-27T10:00:04.000Z","voltage":"220.50","current":"5.20","power":"1146.60"}
```

## 💖 Corporate Sponsors & Backers

Support open-source IoT tooling! `mqtt-mock-sensor` helps thousands of developers, QA teams, and cloud architects simulate realistic IoT telemetry, load test MQTT brokers, and validate cloud pipelines without physical hardware.

If your organization benefits from `mqtt-mock-sensor`, consider becoming a corporate sponsor. Sponsoring helps ensure active maintenance, fast issue turnaround, and continuous feature expansion.

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

## 🏗️ Architecture & Project Structure

The codebase adopts a **Pragmatic Modular Architecture** designed for clarity, testability, and zero-overhead performance:

```text
mqtt-mock-sensor/
├── index.js                     # CLI Entry Point & Options Controller
├── src/                         # Core runtime modules
│   ├── clientManager.js         # MQTT socket connections, TLS/mTLS, LWT
│   ├── runner.js                # Simulation lifecycle, interval loops, chaos timing
│   ├── payloadGenerator.js      # Telemetry schemas (v1/v2), anomalies, presets
│   ├── csvReplayer.js           # Historical CSV dataset replay engine
│   ├── shadowManager.js         # Bi-directional Device Shadow delta reconciliation
│   ├── enrollmentHelper.js      # Dynamic REST API device enrollment bootstrap
│   └── wizardHelper.js          # Interactive terminal setup wizard
├── tests/                       # Jest unit test suites
│   ├── csvReplayer.test.js
│   ├── enrollmentHelper.test.js
│   ├── payloadGenerator.test.js
│   ├── shadowManager.test.js
│   └── wizardHelper.test.js
├── DockerFile                   # Minimal production container build
└── package.json
```

## 🧪 Development & Testing

Clone the repository and run tests or linter locally:

```bash
# Run the complete test suite (43 unit tests)
npm test

# Check code style with ESLint
npm run lint

# Format code with Prettier
npm run format
```

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/thitipongroo/mqtt-mock-sensor/issues).
