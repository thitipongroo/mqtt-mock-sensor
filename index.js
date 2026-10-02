#!/usr/bin/env node

const { program } = require('commander');
const mqtt = require('mqtt');

program
    .version('1.0.0')
    .description('Mock IoT Sensor Data Publisher')
    .option('-b, --broker <url>', 'MQTT broker URL', 'mqtt://test.mosquitto.org')
    .option('-t, --topic <topic>', 'MQTT topic to publish to', 'sensor/mock/data')
    .option('-i, --interval <ms>', 'Interval between messages in ms', 2000)
    .parse(process.argv);

const options = program.opts();

console.log(`🔌 Connecting to MQTT broker at ${options.broker}...`);
const client = mqtt.connect(options.broker);

// Declare interval variable outside so it can be cleared during shutdown
let intervalId;

client.on('connect', () => {
    console.log(`✅ Connected! Publishing data to topic: ${options.topic} every ${options.interval}ms`);
    console.log(`(Press Ctrl+C to stop)`);

    // Store the interval ID
    intervalId = setInterval(() => {
        // Generate mock data
        const payload = {
            deviceId: `mock-device-${Math.floor(Math.random() * 1000)}`,
            temperature: (Math.random() * 15 + 20).toFixed(2), // 20.00 - 35.00
            humidity: (Math.random() * 40 + 40).toFixed(2),    // 40.00 - 80.00
            timestamp: new Date().toISOString()
        };

        const message = JSON.stringify(payload);
        client.publish(options.topic, message);
        console.log(`📤 Published: ${message}`);
    }, options.interval);
});

client.on('error', (err) => {
    console.error('❌ Connection error:', err);
    process.exit(1);
});

// Graceful Shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Gracefully shutting down...');

    // 1. Stop generating new mock data (Clear Interval)
    if (intervalId) {
        clearInterval(intervalId);
    }

    // 2. Safely disconnect from the MQTT broker
    client.end(false, () => {
        console.log('🔌 Disconnected from MQTT broker. Goodbye!');
        // 3. Exit the process cleanly
        process.exit(0);
    });
});