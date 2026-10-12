#!/usr/bin/env node

const { program } = require('commander');
const mqtt = require('mqtt');
const { version, description } = require('./package.json');
const { generatePayload } = require('./payloadGenerator');
const fs = require('fs');

// 1. Add new command-line options for Auth and Sensor Type
program
    .version(version)
    .description(description)
    .option('-b, --broker <url>', 'MQTT broker URL', 'mqtts://broker.hivemq.com:8883')
    .option('-t, --topic <topic>', 'MQTT topic to publish to', 'sensor/mock/data')
    .option('-i, --interval <ms>', 'Interval between messages in ms', 2000)
    .option('-u, --username <user>', 'MQTT broker username (optional)')
    .option('-p, --password <pass>', 'MQTT broker password (optional)')
    .option('--type <type>', 'Sensor type: env (default), gps, power', 'env')
    .option('-d, --device-id <id>', 'Specific device ID (default: auto-generated session ID)')
    .option('--devices <count>', 'Number of simulated devices', (val) => parseInt(val, 10), 1)
    .option('-q, --qos <0|1|2>', 'MQTT QoS level (0, 1, or 2)', (val) => parseInt(val, 10), 0)
    .option('-r, --retain', 'Set MQTT retain flag (Default: `false`', false)
    .option('--template <path>', 'Path to custom JSON template file')
    .parse(process.argv);

const options = program.opts();

// Check QoS
if (![0, 1, 2].includes(options.qos)) {
    console.error('❌ Error: QoS must be 0, 1, or 2');
    process.exit(1);
}

// options -> client.publish()
const publishOptions = {
    qos: options.qos,
    retain: options.retain
};

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

const deviceList = Array.from({ length: options.devices }, (_, index) => {
    return options.deviceId && options.devices === 1
        ? options.deviceId
        : `mock-device-${String(index + 1).padStart(3, '0')}`;
});

let intervalId;

let customTemplate = null;
if (options.template) {
    try {
        customTemplate = fs.readFileSync(options.template, 'utf-8');
    } catch (err) {
        console.error(`❌ Failed to read template file: ${err.message}`);
        process.exit(1);
    }
}

client.on('reconnect', () => {
    console.log('🔄 Reconnecting to MQTT broker...');
});

client.on('connect', () => {
    console.log(`✅ Connected! Simulating ${deviceList.length} device(s)...`);
    console.log(`(Press Ctrl+C to stop)`);
    intervalId = setInterval(() => {
        deviceList.forEach((devId) => {
            const message = generatePayload(options.type, {
                deviceId: devId,
                template: customTemplate
            });
            client.publish(options.topic, message, publishOptions, (err) => {
                if (err) console.error(`❌ Publish error: ${err.message}`);
            });
            console.log(`📤 ${devId} -> ${message}`);
        });
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
