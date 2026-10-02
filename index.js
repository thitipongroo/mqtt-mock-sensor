#!/usr/bin/env node

const { program } = require('commander');
const mqtt = require('mqtt');

// 1. Add new command-line options for Auth and Sensor Type
program
    .version('1.0.0')
    .description('Mock IoT Sensor Data Publisher')
    .option('-b, --broker <url>', 'MQTT broker URL', 'mqtt://test.mosquitto.org')
    .option('-t, --topic <topic>', 'MQTT topic to publish to', 'sensor/mock/data')
    .option('-i, --interval <ms>', 'Interval between messages in ms', 2000)
    .option('-u, --username <user>', 'MQTT broker username (optional)')
    .option('-p, --password <pass>', 'MQTT broker password (optional)')
    .option('--type <type>', 'Sensor type: env (default), gps, power', 'env')
    .parse(process.argv);

const options = program.opts();

// 2. Setup connection options including Authentication if provided
const connectOptions = {};
if (options.username) connectOptions.username = options.username;
if (options.password) connectOptions.password = options.password;

console.log(`🔌 Connecting to MQTT broker at ${options.broker}...`);
// Pass the connectOptions to the MQTT client
const client = mqtt.connect(options.broker, connectOptions);

let intervalId;

client.on('connect', () => {
    console.log(`✅ Connected! Publishing [${options.type.toUpperCase()}] data to topic: ${options.topic} every ${options.interval}ms`);
    console.log(`(Press Ctrl+C to stop)`);

    intervalId = setInterval(() => {
        // Base payload data
        let payload = {
            deviceId: `mock-device-${Math.floor(Math.random() * 1000)}`,
            timestamp: new Date().toISOString()
        };

        // 3. Generate different data based on the selected sensor type
        switch (options.type.toLowerCase()) {
            case 'gps':
                payload.latitude = (Math.random() * 180 - 90).toFixed(6);
                payload.longitude = (Math.random() * 360 - 180).toFixed(6);
                payload.speed = (Math.random() * 100).toFixed(2); // km/h
                break;
            case 'power':
                payload.voltage = (Math.random() * 20 + 210).toFixed(2); // 210 - 230 V
                payload.current = (Math.random() * 10).toFixed(2);       // 0 - 10 A
                payload.power = (payload.voltage * payload.current).toFixed(2); // Watts
                break;
            case 'env':
            default:
                payload.temperature = (Math.random() * 15 + 20).toFixed(2); // 20.00 - 35.00
                payload.humidity = (Math.random() * 40 + 40).toFixed(2);    // 40.00 - 80.00
                break;
        }

        const message = JSON.stringify(payload);
        client.publish(options.topic, message);
        console.log(`📤 Published: ${message}`);
    }, options.interval);
});

client.on('error', (err) => {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
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