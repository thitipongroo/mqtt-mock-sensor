#!/usr/bin/env node

const { program } = require('commander');
const { exec } = require('child_process');
const fs = require('fs');
const { version, description } = require('./package.json');
const { enrollDevice } = require('./src/enrollmentHelper');
const { CsvReplayer } = require('./src/csvReplayer');
const { runWizard } = require('./src/wizardHelper');
const { ClientManager } = require('./src/clientManager');
const { SimulationRunner, printCta } = require('./src/runner');
const { generatePayload } = require('./src/payloadGenerator');
const { ShadowManager } = require('./src/shadowManager');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ANOMALY_TYPES = ['critical', 'warning', 'quality', 'out-of-bounds'];

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
        'Domain preset: industrial, env, air, gps (or sentinel-env, sentinel-industrial, sentinel-air)'
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
        'REST device enrollment URL (e.g. http://localhost:8080/api/v1/devices/enroll)'
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
    .option('--ui', 'Preview Pulse SensorLab Visual Web Studio in browser', false)
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
    .option('--no-replay-loop', 'Do not loop CSV replay after reaching EOF');

async function main(customOptions) {
    if (!customOptions && (!program.rawArgs || program.rawArgs.length === 0)) {
        program.parse(process.argv);
    }
    const options = customOptions ? { ...program.opts(), ...customOptions } : program.opts();
    if (options.ui) {
        console.log('\n🚀 Pulse SensorLab Visual Web Studio');
        console.log('⚡ Design sensor fleets visually and test chaos scenarios in your browser!');
        console.log(
            '🌐 Opening Web Studio in your browser: https://sensorlab.pulseiot-cloud.com\n'
        );

        const openCmd =
            process.platform === 'darwin'
                ? 'open'
                : process.platform === 'win32'
                  ? 'start ""'
                  : 'xdg-open';

        exec(`${openCmd} "https://sensorlab.pulseiot-cloud.com"`, () => {});
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

    // Dynamic Enrollment Bootstrap (Optional)
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

    const clientManager = new ClientManager(options.broker, {
        ...options,
        runtimeUsername,
        runtimePassword
    });

    const runner = new SimulationRunner({
        options,
        deviceList,
        targetTopicTemplate,
        effectiveSchemaVersion,
        customTemplate,
        csvReplayer,
        clientManager
    });

    runner.start();
}

if (require.main === module) {
    program.parse(process.argv);
    main().catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = {
    main,
    program,
    printCta,
    generatePayload,
    SimulationRunner,
    ClientManager,
    CsvReplayer,
    ShadowManager,
    enrollDevice,
    runWizard
};
