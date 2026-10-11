#!/usr/bin/env node

const { program } = require('commander');
const mqtt = require('mqtt');
const { version, description } = require('./package.json');
const { generatePayload } = require('./payloadGenerator');

// 1. Add new command-line options for Auth and Sensor Type
program
    .version(version)
    .description(description)
    .option('-b, --broker <url>', 'MQTT broker URL', 'wss://broker.emqx.io:8084/mqtt')
    .option('-t, --topic <topic>', 'MQTT topic to publish to', 'sensor/mock/data')
    .option('-i, --interval <ms>', 'Interval between messages in ms', 2000)
    .option('-u, --username <user>', 'MQTT broker username (optional)')
    .option('-p, --password <pass>', 'MQTT broker password (optional)')
    .option('--type <type>', 'Sensor type: env (default), gps, power', 'env')
    .option('-d, --device-id <id>', 'Specific device ID (default: auto-generated session ID)')
    .parse(process.argv);

const options = program.opts();

// 2. Setup connection options including Authentication if provided
const activeDeviceId = options.deviceId || `mock-device-${Math.floor(Math.random() * 1000)}`;
const connectOptions = {
    clientId: `mock_sensor_${Math.random().toString(16).substring(2, 10)}`,
    clean: true,
    connectTimeout: 5000,
    reconnectPeriod: 3000
};
if (options.username) connectOptions.username = options.username;
if (options.password) connectOptions.password = options.password;

console.log(`🔌 Connecting to MQTT broker at ${options.broker}...`);
// Pass the connectOptions to the MQTT client
const client = mqtt.connect(options.broker, connectOptions);

let intervalId;

client.on('reconnect', () => {
    console.log('🔄 Reconnecting to MQTT broker...');
});

client.on('connect', () => {
    console.log(
        `✅ Connected! Publishing [${options.type.toUpperCase()}] data to topic: ${options.topic} every ${options.interval}ms`
    );
    console.log(`(Press Ctrl+C to stop)`);

    intervalId = setInterval(() => {
        const message = generatePayload(options.type, { deviceId: activeDeviceId });
        client.publish(options.topic, message);
        console.log(`📤 Published: ${message}`);
    }, options.interval);
});

client.on('error', (err) => {
    console.error('⚠️ Connection error:', err.message);
});

// Graceful Shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Gracefully shutting down...');

    if (intervalId) {
        clearInterval(intervalId);
    }

    client.end(false, () => {
        console.log('🔌 Disconnected from MQTT broker. Goodbye!');
        process.exit(0);
    });
});
