#!/usr/bin/env node

const { program } = require('commander');
const mqtt = require('mqtt');
const { version, description } = require('./package.json');
const { generatePayload } = require('./payloadGenerator');
const { ShadowManager } = require('./shadowManager');
const { enrollDevice } = require('./enrollmentHelper');
const { CsvReplayer } = require('./csvReplayer');
const { runWizard } = require('./wizardHelper');
const fs = require('fs');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ANOMALY_TYPES = ['critical', 'warning', 'quality', 'out-of-bounds'];

function printCta() {
    console.log('⭐ Enjoying mqtt-mock-sensor? Star us on GitHub & consider Sponsoring!');
    console.log(
        '🚀 Want a Visual Web Dashboard with 100k scale? Join waitlist: https://pulseiot.io'
    );
}

program
    .version(version)
    .description(description)
    .option('-b, --broker <url>', 'MQTT broker URL', 'mqtts://broker.hivemq.com:8883')
    .option('-t, --topic <topic>', 'MQTT topic to publish to (supports {deviceId} and {orgId})')
    .option('-i, --interval <ms>', 'Interval between messages in ms', (v) => parseInt(v, 10), 2000)
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
    .option('--schema-version <ver>', 'Telemetry schema version: 1 or 2', (v) => parseInt(v, 10))
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
        'Spawn separate MQTT TCP/TLS socket connections per device',
        false
    )
    .option('--shadow', 'Enable Bi-directional Device Shadow synchronization', false)
    .option(
        '--enroll-url <url>',
        'Sentinel REST enrollment URL (e.g. http://localhost:8080/api/v1/devices/enroll)'
    )
    .option('--enroll-token <token>', 'Single-use device enrollment bootstrap token')
    .option(
        '--chaos-jitter <ms>',
        'Inject random network latency up to N ms before publish',
        (v) => parseInt(v, 10),
        0
    )
    .option(
        '--chaos-disconnect <percent>',
        'Random ungraceful disconnect probability %',
        (v) => parseFloat(v),
        0
    )
    .option('--ui', 'Preview PulseIoT Visual Web Dashboard & join waitlist', false)
    .option(
        '--will-topic <topic>',
        'MQTT Last Will and Testament (LWT) topic (supports {deviceId} and {orgId})'
    )
    .option(
        '--will-message <message>',
        'MQTT LWT message payload (default: {"status":"OFFLINE","deviceId":"{deviceId}"})'
    )
    .option('--will-qos <0|1|2>', 'MQTT LWT QoS level (0, 1, or 2)', (v) => parseInt(v, 10), 0)
    .option('--will-retain', 'Set MQTT LWT retain flag', false)
    .option('--replay <file>', 'Path to CSV file to replay real sensor telemetry')
    .option('--no-replay-loop', 'Do not loop CSV replay after reaching EOF')
    .parse(process.argv);

const options = program.opts();

async function main() {
    if (options.ui) {
        console.log('\n🚀 PulseIoT Visual Web Dashboard (Private Beta)');
        console.log('⚡ Simulate 100,000 IoT Sensors & Test Chaos Scenarios in Your Browser!');
        console.log('🌐 Opening waitlist in your browser: https://pulseiot-cloud.io\n');

        const { exec } = require('child_process');
        const openCmd =
            process.platform === 'darwin'
                ? 'open'
                : process.platform === 'win32'
                  ? 'start ""'
                  : 'xdg-open';

        exec(`${openCmd} "https://pulseiot-cloud.io"`, () => {});
        return;
    }

    const isInteractive = process.argv.slice(2).length === 0 && process.stdin.isTTY;
    if (isInteractive) {
        const wizardAnswers = await runWizard();
        options.type = wizardAnswers.type;
        if (wizardAnswers.preset) options.preset = wizardAnswers.preset;
        options.broker = wizardAnswers.broker;
        options.devices = wizardAnswers.devices;
    }

    if (![0, 1, 2].includes(options.qos)) {
        console.error('❌ Error: QoS must be 0, 1, or 2');
        process.exit(1);
    }

    if (options.willTopic && ![0, 1, 2].includes(options.willQos)) {
        console.error('❌ Error: --will-qos must be 0, 1, or 2');
        process.exit(1);
    }

    if (options.anomalyType && !VALID_ANOMALY_TYPES.includes(options.anomalyType.toLowerCase())) {
        console.error(`❌ Error: Invalid --anomaly-type "${options.anomalyType}".`);
        process.exit(1);
    }

    let effectiveSchemaVersion = options.schemaVersion;
    if (!effectiveSchemaVersion) {
        effectiveSchemaVersion =
            options.preset && options.preset.toLowerCase().startsWith('sentinel-') ? 2 : 1;
    }

    if (![1, 2].includes(effectiveSchemaVersion)) {
        console.error('❌ Error: --schema-version must be 1 or 2');
        process.exit(1);
    }

    if (options.orgId && !UUID_REGEX.test(options.orgId)) {
        console.error(
            `❌ Error: Invalid --org-id format "${options.orgId}". Must be a valid UUID.`
        );
        process.exit(1);
    }

    if (options.shadow && !options.orgId) {
        console.error(
            '❌ Error: --shadow requires --org-id for topic construction (tenants/{orgId}/devices/{deviceId}/shadow/...)'
        );
        process.exit(1);
    }

    let customTemplate = null;
    if (options.template) {
        try {
            customTemplate = fs.readFileSync(options.template, 'utf-8');
        } catch (err) {
            console.error(`❌ Failed to read template file: ${err.message}`);
            process.exit(1);
        }
    }

    let targetTopicTemplate = options.topic;
    if (!targetTopicTemplate) {
        targetTopicTemplate = options.orgId
            ? `tenants/${options.orgId}/devices/{deviceId}/telemetry`
            : 'sensor/mock/data';
    }

    let csvReplayer = null;
    if (options.replay) {
        try {
            csvReplayer = new CsvReplayer(options.replay, {
                loop: options.replayLoop !== false
            });
        } catch (err) {
            console.error(`❌ Failed to read CSV replay file: ${err.message}`);
            process.exit(1);
        }
    }

    const deviceList = Array.from({ length: options.devices }, (_, index) => {
        return options.deviceId && options.devices === 1
            ? options.deviceId
            : `mock-device-${String(index + 1).padStart(3, '0')}`;
    });

    // 1. Dynamic Enrollment Bootstrap (Optional)
    let runtimeUsername = options.username;
    let runtimePassword = options.password;

    if (options.enrollUrl && options.enrollToken) {
        try {
            const primaryDevId = deviceList[0];
            const credentials = await enrollDevice(
                options.enrollUrl,
                primaryDevId,
                options.enrollToken
            );
            runtimeUsername = credentials.username;
            runtimePassword = credentials.password;
        } catch (err) {
            console.error(`❌ Enrollment failed: ${err.message}`);
            process.exit(1);
        }
    }

    // 2. Concurrency & Runtime Loop
    const tlsOptions = {};
    if (options.ca) tlsOptions.ca = fs.readFileSync(options.ca);
    if (options.cert) tlsOptions.cert = fs.readFileSync(options.cert);
    if (options.key) tlsOptions.key = fs.readFileSync(options.key);
    if (options.insecure) tlsOptions.rejectUnauthorized = false;

    const activeClients = [];
    const activeIntervals = new Map();
    const publishedCounts = new Map();
    deviceList.forEach((d) => publishedCounts.set(d, 0));

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

    function checkExitCondition() {
        if (csvReplayer && options.replayLoop === false) {
            const allRowsConsumed = deviceList.every((d) => !csvReplayer.hasMoreRows(d));
            if (allRowsConsumed) {
                console.log(
                    `\n✅ Replayed all ${csvReplayer.getRowCount()} CSV row(s) successfully. Exiting.`
                );
                printCta();
                console.log();
                shutdownAndExit(0);
                return;
            }
        }

        if (!options.count) return;
        const allDone = deviceList.every((d) => publishedCounts.get(d) >= options.count);
        if (allDone) {
            console.log(
                `\n✅ Published ${options.count} message(s) per device successfully. Exiting.`
            );
            printCta();
            console.log();
            shutdownAndExit(0);
        }
    }

    function buildPayload(devId) {
        if (csvReplayer) {
            const rowPayload = csvReplayer.getNextPayload(devId);
            if (rowPayload) return rowPayload;
        }
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

    function getWillConfig(devId) {
        if (!options.willTopic) return null;
        const willTopic = options.willTopic
            .replace(/\{deviceId\}/g, devId)
            .replace(/\{orgId\}/g, options.orgId || '');
        const defaultWillMsg = JSON.stringify({
            status: 'OFFLINE',
            deviceId: devId,
            timestamp: new Date().toISOString()
        });
        const willPayload = (options.willMessage || defaultWillMsg)
            .replace(/\{deviceId\}/g, devId)
            .replace(/\{orgId\}/g, options.orgId || '');
        return {
            topic: willTopic,
            payload: Buffer.from(willPayload),
            qos: options.willQos !== undefined ? options.willQos : 0,
            retain: Boolean(options.willRetain)
        };
    }

    const useIndependentSockets = options.independentClients || options.shadow;

    printCta();
    console.log();
    console.log(`🔌 Initializing MQTT simulation for ${deviceList.length} device(s)...`);
    console.log(
        `📋 Config: Schema v${effectiveSchemaVersion} | Preset: "${options.preset || options.type}" | Shadow: ${options.shadow ? 'ENABLED' : 'DISABLED'}`
    );
    if (useIndependentSockets) {
        console.log('⚡ Mode: Independent Client Sockets (1 TCP socket per device)');
    }
    if (options.willTopic) {
        console.log(
            `📜 LWT: Enabled (Topic: "${options.willTopic}" | QoS: ${options.willQos || 0} | Retain: ${Boolean(options.willRetain)})`
        );
    }
    if (csvReplayer) {
        console.log(
            `📁 Replay: Active ("${options.replay}" | ${csvReplayer.getRowCount()} rows | Loop: ${options.replayLoop !== false ? 'YES' : 'NO'})`
        );
    }
    if (options.chaosJitter)
        console.log(`⚡ Chaos: Jitter enabled (up to ${options.chaosJitter}ms)`);
    if (options.chaosDisconnect)
        console.log(`⚡ Chaos: Random ungraceful disconnect (${options.chaosDisconnect}%)`);

    if (useIndependentSockets) {
        deviceList.forEach((devId) => {
            const connOpts = {
                clientId: `mock_sensor_${devId}_${Math.random().toString(16).substring(2, 6)}`,
                clean: true,
                connectTimeout: 5000,
                reconnectPeriod: 3000,
                ...tlsOptions
            };
            if (runtimeUsername) connOpts.username = runtimeUsername;
            if (runtimePassword) connOpts.password = runtimePassword;
            const will = getWillConfig(devId);
            if (will) connOpts.will = will;

            const client = mqtt.connect(options.broker, connOpts);
            activeClients.push(client);

            client.on('connect', () => {
                console.log(`✅ [${devId}] Connected to broker.`);

                let currentIntervalMs = options.interval;
                if (options.shadow) {
                    const shadow = new ShadowManager(
                        client,
                        options.orgId,
                        devId,
                        { interval: currentIntervalMs },
                        (delta) => {
                            if (
                                delta.samplingInterval &&
                                delta.samplingInterval !== currentIntervalMs
                            ) {
                                console.log(
                                    `🔄 [Runtime:${devId}] Adjusting publishing interval to ${delta.samplingInterval}ms`
                                );
                                currentIntervalMs = delta.samplingInterval;
                                restartDeviceLoop(devId, client, currentIntervalMs);
                            }
                        }
                    );
                    shadow.init();
                }

                startDeviceLoop(devId, client, currentIntervalMs);
            });

            client.on('error', (err) => {
                console.error(`⚠️ [${devId}] Connection error:`, err.message);
            });
        });
    } else {
        const connOpts = {
            clientId: `mock_sensor_pool_${Math.random().toString(16).substring(2, 10)}`,
            clean: true,
            connectTimeout: 5000,
            reconnectPeriod: 3000,
            ...tlsOptions
        };
        if (runtimeUsername) connOpts.username = runtimeUsername;
        if (runtimePassword) connOpts.password = runtimePassword;
        const will = getWillConfig(deviceList[0] || 'mock-device');
        if (will) connOpts.will = will;

        const client = mqtt.connect(options.broker, connOpts);
        activeClients.push(client);

        client.on('connect', () => {
            console.log(`✅ Connected to broker! Simulating ${deviceList.length} device(s)...`);
            const intervalId = setInterval(async () => {
                if (options.chaosDisconnect && Math.random() * 100 < options.chaosDisconnect) {
                    console.warn('💥 [Chaos] Simulating sudden unclean network drop!');
                    if (client.stream) client.stream.destroy();
                    return;
                }

                for (const devId of deviceList) {
                    const count = publishedCounts.get(devId);
                    if (options.count && count >= options.count) continue;

                    if (options.chaosJitter > 0) {
                        const delay = Math.floor(Math.random() * options.chaosJitter);
                        await new Promise((r) => setTimeout(r, delay));
                    }

                    const targetTopic = targetTopicTemplate
                        .replace(/\{deviceId\}/g, devId)
                        .replace(/\{orgId\}/g, options.orgId || '');

                    const message = buildPayload(devId);

                    client.publish(
                        targetTopic,
                        message,
                        { qos: options.qos, retain: options.retain },
                        (err) => {
                            if (err) console.error(`❌ [${devId}] Publish error: ${err.message}`);
                        }
                    );
                    console.log(`📤 [${devId}] -> ${message}`);

                    publishedCounts.set(devId, count + 1);
                }
                checkExitCondition();
            }, options.interval);

            activeIntervals.set('pool', intervalId);
        });

        client.on('error', (err) => {
            console.error('⚠️ Connection error:', err.message);
        });
    }

    function startDeviceLoop(devId, client, intervalMs) {
        const intervalId = setInterval(async () => {
            const count = publishedCounts.get(devId);
            if (options.count && count >= options.count) {
                clearInterval(intervalId);
                checkExitCondition();
                return;
            }

            if (options.chaosDisconnect && Math.random() * 100 < options.chaosDisconnect) {
                console.warn(`💥 [Chaos:${devId}] Simulating sudden unclean network drop!`);
                if (client.stream) client.stream.destroy();
                return;
            }

            if (options.chaosJitter > 0) {
                const delay = Math.floor(Math.random() * options.chaosJitter);
                await new Promise((r) => setTimeout(r, delay));
            }

            const targetTopic = targetTopicTemplate
                .replace(/\{deviceId\}/g, devId)
                .replace(/\{orgId\}/g, options.orgId || '');

            const message = buildPayload(devId);

            client.publish(
                targetTopic,
                message,
                { qos: options.qos, retain: options.retain },
                (err) => {
                    if (err) console.error(`❌ [${devId}] Publish error: ${err.message}`);
                }
            );
            console.log(`📤 [${devId}] -> ${message}`);

            publishedCounts.set(devId, count + 1);
            checkExitCondition();
        }, intervalMs);

        activeIntervals.set(devId, intervalId);
    }

    function restartDeviceLoop(devId, client, newIntervalMs) {
        if (activeIntervals.has(devId)) {
            clearInterval(activeIntervals.get(devId));
        }
        startDeviceLoop(devId, client, newIntervalMs);
    }

    process.on('SIGINT', () => {
        console.log('\n🛑 Gracefully shutting down...');
        printCta();
        console.log();
        shutdownAndExit(0);
    });
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
