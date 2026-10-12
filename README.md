# 🌡️ MQTT Mock Sensor

[![NPM Version](https://img.shields.io/npm/v/mqtt-mock-sensor?style=flat&color=CB3837&logo=npm)](https://www.npmjs.com/package/mqtt-mock-sensor)
[![NPM Downloads](https://img.shields.io/npm/dt/mqtt-mock-sensor?style=flat&color=28a745)](https://www.npmjs.com/package/mqtt-mock-sensor)
[![CI Testing](https://github.com/thitipongroo/mqtt-mock-sensor/actions/workflows/ci.yml/badge.svg)](https://github.com/thitipongroo/mqtt-mock-sensor/actions/workflows/ci.yml)

A zero-config, feature-rich CLI tool to generate and stream realistic mock IoT telemetry data to any MQTT broker. Built to accelerate IoT backend development, cloud data pipelines, and AI/ML anomaly detection testing without physical hardware.

## 📦 Installation

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

## ⚙️ Command-Line Options

| Option                | Type    | Default                        | Description                                                        |
| --------------------- | ------- | ------------------------------ | ------------------------------------------------------------------ |
| -b, --broker [url]    | string  | mqtts://broker.hivemq.com:8883 | MQTT Broker URL (Supports mqtt://, mqtts://, ws://, wss://)        |
| -t, --topic [topic]   | string  | sensor/mock/data               | Target topic. Supports {deviceId} placeholder for dynamic routing  |
| -i, --interval [ms]   | number  | 2000                           | Stream interval between messages in milliseconds                   |
| --type < type >       | string  | env                            | Sensor telemetry preset: env, gps, power                           |
| -d, --device-id [id]  | string  | Auto-generated                 | Static device identifier for session                               |
| --devices [count]     | number  | 1                              | Number of concurrent devices to simulate                           |
| -q, --qos [0,1,2]     | number  | 0                              | MQTT Quality of Service level                                      |
| -r, --retain          | boolean | false                          | Enable MQTT retain message flag                                    |
| --count [n]           | number  | Unlimited                      | Automatically stop and exit after publishing N messages per device |
| --anomaly-rate [pct]  | number  | 0                              | Percentage of messages to inject extreme metric anomalies (0-100)  |
| --template [path]     | string  | -                              | Path to a custom JSON template file                                |
| -u, --username [user] | string  | -                              | Broker authentication username                                     |
| -p, --password [pass] | string  | -                              | Broker authentication password                                     |
| --ca [file]           | string  | -                              | Path to custom Root CA certificate                                 |
| --cert [file]         | string  | -                              | Path to client certificate (mTLS)                                  |
| --key [file]          | string  | -                              | Path to client private key (mTLS)                                  |
| --insecure            | boolean | false                          | Allow self-signed SSL/TLS certificates                             |

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

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.
