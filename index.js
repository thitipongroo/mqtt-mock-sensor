#!/usr/bin/env node

const { program } = require('commander');
const mqtt = require('mqtt');
const { version, description } = require('./package.json');
const { generatePayload } = require('./payloadGenerator');
const fs = require('fs');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

program
    .version(version)
    .description(description)
    .option('-b, --broker <url>', 'MQTT broker URL', 'mqtts://broker.hivemq.com:8883')
    .option('-t, --topic <topic>', 'MQTT topic to publish to (supports {deviceId} and {orgId})')
    .option('-i, --interval <ms>', 'Interval between messages in ms', 2000)
    .option('-u, --username <user>', 'MQTT broker username (optional)')
    .option('-p, --password <pass>', 'MQTT broker password (optional)')
    .option('--type <type>', 'Sensor type: env (default), gps, power', 'env')
    .option('-d, --device-id <id>', 'Specific device ID (default: auto-generated session ID)')
    .option('--devices <count>', 'Number of simulated devices', (val) => parseInt(val, 10), 1)
    .option('-q, --qos <0|1|2>', 'MQTT QoS level (0, 1, or 2)', (val) => parseInt(val, 10), 0)
    .option('-r, --retain', 'Set MQTT retain flag (Default: false)', false)
    .option('--template <path>', 'Path to custom JSON template file')
    .option('--ca <file>', 'Path to CA certificate')
    .option('--cert <file>', 'Path to client certificate (mTLS)')
    .option('--key <file>', 'Path to client private key (mTLS)')
    .option('--insecure', 'Allow self-signed certificates', false)
    .option('--count <n>', 'Exit after publishing N messages per device', (v) => parseInt(v, 10))
    .option(
        '--anomaly-rate <percent>',
        'Anomaly injection rate in % (e.g. 5)',
        (v) => parseFloat(v),
        0
    )
    .option(
        '--schema-version <ver>',
        'Telemetry schema version: 1 (legacy flat) or 2 (Sentinel readings)',
        (v) => parseInt(v, 10),
        1
    )
    .option('--org-id <uuid>', 'Organization/Tenant UUID for multi-tenancy')
    .option('--epoch-timestamp', 'Force numeric Unix epoch milliseconds timestamp', false)
    .parse(process.argv);

const options = program.opts();

// Check QoS
if (![0, 1, 2].includes(options.qos)) {
    console.error('❌ Error: QoS must be 0, 1, or 2');
    process.exit(1);
}

// Check Schema Version
if (![1, 2].includes(options.schemaVersion)) {
    console.error('❌ Error: --schema-version must be 1 or 2');
    process.exit(1);
}

// Check Organization UUID (Option)
if (options.orgId && !UUID_REGEX.test(options.orgId)) {
    console.error(`❌ Error: Invalid --org-id format "${options.orgId}". Must be a valid UUID.`);
    process.exit(1);
}

// Default Topic Multi-tenancy format
let targetTopicTemplate = options.topic;
if (!targetTopicTemplate) {
    if (options.orgId) {
        targetTopicTemplate = `tenants/${options.orgId}/devices/{deviceId}/telemetry`;
    } else {
        targetTopicTemplate = 'sensor/mock/data';
    }
}

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
if (options.ca) connectOptions.ca = fs.readFileSync(options.ca);
if (options.cert) connectOptions.cert = fs.readFileSync(options.cert);
if (options.key) connectOptions.key = fs.readFileSync(options.key);
if (options.insecure) connectOptions.rejectUnauthorized = false;

console.log(`🔌 Connecting to MQTT broker at ${options.broker}...`);

const client = mqtt.connect(options.broker, connectOptions);

const deviceList = Array.from({ length: options.devices }, (_, index) => {
    return options.deviceId && options.devices === 1
        ? options.deviceId
        : `mock-device-${String(index + 1).padStart(3, '0')}`;
});

let intervalId;
let publishedCounts = new Map();
deviceList.forEach((d) => publishedCounts.set(d, 0));

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
    console.log(
        `✅ Connected! Simulating ${deviceList.length} device(s) [Schema v${options.schemaVersion}]...`
    );
    console.log(`📡 Topic Template: ${targetTopicTemplate}`);
    console.log(`(Press Ctrl+C to stop)`);

    intervalId = setInterval(() => {
        let allCompleted = true;

        deviceList.forEach((devId) => {
            const currentCount = publishedCounts.get(devId);
            if (options.count && currentCount >= options.count) {
                return;
            }
            allCompleted = false;

            const targetTopic = targetTopicTemplate
                .replace(/\{deviceId\}/g, devId)
                .replace(/\{orgId\}/g, options.orgId || '');

            const message = generatePayload(options.type, {
                deviceId: devId,
                template: customTemplate,
                anomalyRate: options.anomalyRate,
                schemaVersion: options.schemaVersion,
                orgId: options.orgId,
                epochTimestamp: options.epochTimestamp
            });

            client.publish(targetTopic, message, publishOptions, (err) => {
                if (err) console.error(`❌ Publish error: ${err.message}`);
            });
            console.log(`📤 ${devId} -> ${message}`);

            publishedCounts.set(devId, currentCount + 1);
        });

        // check (--count)
        if (options.count && allCompleted) {
            console.log(
                `\n✅ Published ${options.count} message(s) per device successfully. Exiting.`
            );
            clearInterval(intervalId);
            client.end(false, () => {
                process.exit(0);
            });
        }
    }, options.interval);
});

client.on('error', (err) => {
    console.error('⚠️ Connection error:', err.message);
});

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
