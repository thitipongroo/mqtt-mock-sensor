# 🌡️ MQTT Mock Sensor

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
mock-sensor --broker <broker-url> --topic <topic-name> --interval <milliseconds>
```

**Options:**
* `-b, --broker`: MQTT Broker URL (Default: `mqtt://test.mosquitto.org`)
* `-t, --topic`: Topic to publish to (Default: `sensor/mock/data`)
* `-i, --interval`: Publishing interval in ms (Default: `2000`)

## 💡 Example Output

```json
📤 Published: {"deviceId":"mock-device-412","temperature":"24.51","humidity":"55.23","timestamp":"2023-10-27T10:00:00.000Z"}
```

## 🤝 Contributing
Feel free to submit issues or pull requests to add more sensor types (e.g., GPS, accelerometer).