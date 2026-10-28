// @ts-check
'use strict';

const { program } = require('commander');
const { version, description } = require('../../package.json');

/**
 * Configures all command-line options on the Commander program instance.
 * @returns {typeof program}
 */
function buildCliProgram() {
    return program
        .version(version)
        .description(description)
        .option('-b, --broker <url>', 'MQTT broker URL', 'mqtts://broker.hivemq.com:8883')
        .option(
            '--allow-local',
            'Allow connection to loopback or link-local broker addresses (SSRF warning)',
            false
        )
        .option('-t, --topic <topic>', 'MQTT topic to publish to (supports {deviceId} and {orgId})')
        .option(
            '-i, --interval <ms>',
            'Interval between messages in ms',
            (v) => parseInt(v, 10),
            2000
        )
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
        .option('--count <n>', 'Exit after publishing N messages per device', (v) =>
            parseInt(v, 10)
        )
        .option('--duration <sec>', 'Exit simulation after specified seconds', (v) =>
            parseInt(v, 10)
        )
        .option('--schema-version <ver>', 'Telemetry schema version: 1 or 2', (v) =>
            parseInt(v, 10)
        )
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
}

module.exports = {
    program,
    buildCliProgram
};
