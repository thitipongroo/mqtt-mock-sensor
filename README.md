# 🌡️ MQTT Mock Sensor

[![NPM Version](https://img.shields.io/npm/v/mqtt-mock-sensor?style=flat&color=CB3837&logo=npm)](https://www.npmjs.com/package/mqtt-mock-sensor)
[![NPM Downloads](https://img.shields.io/npm/dt/mqtt-mock-sensor?style=flat&color=28a745)](https://www.npmjs.com/package/mqtt-mock-sensor)

A simple Node.js CLI tool to generate and publish mock IoT sensor data to any MQTT broker. Perfect for backend and frontend developers who need to test IoT applications without physical hardware.

## 📦 Installation

You can run it directly using `npx` (no installation required!):

```bash
npx mqtt-mock-sensor --broker mqtt://test.mosquitto.org --topic my/iot/topic
```

Or install it globally:

```bash
npm install -g mqtt-mock-sensor
```

## 🚀 Usage

```bash
mock-sensor --broker <broker-url> --topic <topic-name> --type <sensor-type>
```

**Options:**

- `-b, --broker` : MQTT Broker URL (Default: `mqtt://test.mosquitto.org`)
- `-t, --topic` : Topic to publish to (Default: `sensor/mock/data`)
- `-i, --interval` : Publishing interval in milliseconds (Default: `2000`)
- `-u, --username` : MQTT Broker username for authentication (Optional)
- `-p, --password` : MQTT Broker password for authentication (Optional)
- `--type` : Type of sensor data to mock (`env`, `gps`, `power`) (Default: `env`)

### Examples

**Connect with Username and Password:**

```bash
mock-sensor -b mqtt://secure-broker.com -u "admin" -p "secret123"
```

**Generate GPS Data:**

```bash
mock-sensor --type gps --topic vehicle/location
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

## 🤝 Contributing

Feel free to submit issues or pull requests to add more sensor types or features.
