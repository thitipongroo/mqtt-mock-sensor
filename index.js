#!/usr/bin/env node

const { program } = require('commander');
const mqtt = require('mqtt');
const { version, description } = require('./package.json');
const { generatePayload } = require('./payloadGenerator');
const fs = require('fs');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ANOMALY_TYPES = ['critical', 'warning', 'quality', 'out-of-bounds'];

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
        '--schema-version <ver>',
        'Telemetry schema version: 1 (legacy flat) or 2 (Sentinel readings)',
        (v) => parseInt(v, 10)
    )
    .option('--org-id <uuid>', 'Organization/Tenant UUID for multi-tenancy')
    .option('--epoch-timestamp', 'Force numeric Unix epoch milliseconds timestamp', false)
    .option(
        '--preset <name>',
        'Sentinel domain preset: sentinel-env, sentinel-industrial, sentinel-air'
    )
    .option(
        '--anomaly-rate <percent>',
        'Anomaly injection rate in % (e.g. 10)',
        (v) => parseFloat(v),
        0
    )
    .option(
        '--anomaly-type <type>',
        'Type of anomaly: critical, warning, quality, out-of-bounds',
        'critical'
    )
    .option(
        '--independent-clients',
        'Spawn separate MQTT TCP/TLS socket connections per device (true concurrency)',
        false
    )
    .parse(process.argv);

const options = program.opts();

// ตรวจสอบค่า QoS
if (![0, 1, 2].includes(options.qos)) {
    console.error('❌ Error: QoS must be 0, 1, or 2');
    process.exit(1);
}

// ตรวจสอบค่า Anomaly Type
if (options.anomalyType && !VALID_ANOMALY_TYPES.includes(options.anomalyType.toLowerCase())) {
    console.error(
        `❌ Error: Invalid --anomaly-type "${options.anomalyType}". Valid options: ${VALID_ANOMALY_TYPES.join(', ')}`
    );
    process.exit(1);
}

// กำหนดค่า Schema Version อัตโนมัติ: หากเลือก Preset Sentinel ให้เป็น v2 อัตโนมัติ
let effectiveSchemaVersion = options.schemaVersion;
if (!effectiveSchemaVersion) {
    if (options.preset && options.preset.toLowerCase().startsWith('sentinel-')) {
        effectiveSchemaVersion = 2;
    } else {
        effectiveSchemaVersion = 1;
    }
}

if (![1, 2].includes(effectiveSchemaVersion)) {
    console.error('❌ Error: --schema-version must be 1 or 2');
    process.exit(1);
}

// ตรวจสอบความถูกต้องของ Organization UUID
if (options.orgId && !UUID_REGEX.test(options.orgId)) {
    console.error(`❌ Error: Invalid --org-id format "${options.orgId}". Must be a valid UUID.`);
    process.exit(1);
}

// กำหนด Default Topic Template
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

// อ่านไฟล์ Certificate (ถ้ามี)
const tlsOptions = {};
if (options.ca) tlsOptions.ca = fs.readFileSync(options.ca);
if (options.cert) tlsOptions.cert = fs.readFileSync(options.cert);
if (options.key) tlsOptions.key = fs.readFileSync(options.key);
if (options.insecure) tlsOptions.rejectUnauthorized = false;

let customTemplate = null;
if (options.template) {
    try {
        customTemplate = fs.readFileSync(options.template, 'utf-8');
    } catch (err) {
        console.error(`❌ Failed to read template file: ${err.message}`);
        process.exit(1);
    }
}

const deviceList = Array.from({ length: options.devices }, (_, index) => {
    return options.deviceId && options.devices === 1
        ? options.deviceId
        : `mock-device-${String(index + 1).padStart(3, '0')}`;
});

const selectedPreset = options.preset || options.type;

console.log(`🔌 Initializing MQTT simulation for ${deviceList.length} device(s)...`);
console.log(
    `📋 Configuration: Schema v${effectiveSchemaVersion} | Preset: "${selectedPreset}" | Anomaly: ${options.anomalyRate}% (${options.anomalyType})`
);
console.log(`📡 Topic Template: ${targetTopicTemplate}`);
if (options.independentClients) {
    console.log(`⚡ Mode: Independent Client Sockets (1 TCP socket per device)`);
}

// ──────────────────────────────────────────────────────────
// Helper: Function สร้าง Message ประจำ Device
// ──────────────────────────────────────────────────────────
function createDeviceMessage(devId) {
    return generatePayload(options.type, {
        deviceId: devId,
        template: customTemplate,
        preset: options.preset,
        anomalyRate: options.anomalyRate,
        anomalyType: options.anomalyType,
        schemaVersion: effectiveSchemaVersion,
        orgId: options.orgId,
        epochTimestamp: options.epochTimestamp
    });
}

// ──────────────────────────────────────────────────────────
// Concurrency Engine: Single Connection vs Multi-Socket Pool
// ──────────────────────────────────────────────────────────
let activeClients = [];
let activeIntervals = [];
let publishedCounts = new Map();
deviceList.forEach((d) => publishedCounts.set(d, 0));

function checkExitCondition() {
    if (!options.count) return;
    const allDone = deviceList.every((d) => publishedCounts.get(d) >= options.count);
    if (allDone) {
        console.log(`\n✅ Published ${options.count} message(s) per device successfully. Exiting.`);
        shutdownAndExit(0);
    }
}

function shutdownAndExit(code = 0) {
    activeIntervals.forEach((id) => clearInterval(id));
    let remaining = activeClients.length;
    if (remaining === 0) process.exit(code);

    activeClients.forEach((c) => {
        c.end(false, () => {
            remaining -= 1;
            if (remaining <= 0) {
                console.log('🔌 Disconnected all MQTT clients. Goodbye!');
                process.exit(code);
            }
        });
    });
}

if (options.independentClients) {
    // ── Mode A: True Independent Sockets (1 Client ต่อ 1 Device) ───────────
    deviceList.forEach((devId) => {
        const connOpts = {
            clientId: `mock_sensor_${devId}_${Math.random().toString(16).substring(2, 6)}`,
            clean: true,
            connectTimeout: 5000,
            reconnectPeriod: 3000,
            ...tlsOptions
        };
        if (options.username) connOpts.username = options.username;
        if (options.password) connOpts.password = options.password;

        const client = mqtt.connect(options.broker, connOpts);
        activeClients.push(client);

        client.on('connect', () => {
            console.log(`✅ [${devId}] Connected via independent socket.`);
            const intervalId = setInterval(() => {
                const count = publishedCounts.get(devId);
                if (options.count && count >= options.count) {
                    clearInterval(intervalId);
                    checkExitCondition();
                    return;
                }

                const targetTopic = targetTopicTemplate
                    .replace(/\{deviceId\}/g, devId)
                    .replace(/\{orgId\}/g, options.orgId || '');
                const message = createDeviceMessage(devId);

                client.publish(targetTopic, message, publishOptions, (err) => {
                    if (err) console.error(`❌ [${devId}] Publish error: ${err.message}`);
                });
                console.log(`📤 [${devId}] -> ${message}`);

                publishedCounts.set(devId, count + 1);
                checkExitCondition();
            }, options.interval);
            activeIntervals.push(intervalId);
        });

        client.on('error', (err) => {
            console.error(`⚠️ [${devId}] Connection error:`, err.message);
        });
    });
} else {
    // ── Mode B: Multiplexed Single Client (ค่าเริ่มต้นเดิม) ─────────────────
    const connOpts = {
        clientId: `mock_sensor_pool_${Math.random().toString(16).substring(2, 10)}`,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 3000,
        ...tlsOptions
    };
    if (options.username) connOpts.username = options.username;
    if (options.password) connOpts.password = options.password;

    const client = mqtt.connect(options.broker, connOpts);
    activeClients.push(client);

    client.on('connect', () => {
        console.log(`✅ Connected to broker! Simulating ${deviceList.length} device(s)...`);
        const intervalId = setInterval(() => {
            deviceList.forEach((devId) => {
                const count = publishedCounts.get(devId);
                if (options.count && count >= options.count) return;

                const targetTopic = targetTopicTemplate
                    .replace(/\{deviceId\}/g, devId)
                    .replace(/\{orgId\}/g, options.orgId || '');
                const message = createDeviceMessage(devId);

                client.publish(targetTopic, message, publishOptions, (err) => {
                    if (err) console.error(`❌ Publish error: ${err.message}`);
                });
                console.log(`📤 ${devId} -> ${message}`);

                publishedCounts.set(devId, count + 1);
            });
            checkExitCondition();
        }, options.interval);
        activeIntervals.push(intervalId);
    });

    client.on('error', (err) => {
        console.error('⚠️ Connection error:', err.message);
    });
}

process.on('SIGINT', () => {
    console.log('\n🛑 Gracefully shutting down...');
    shutdownAndExit(0);
});
