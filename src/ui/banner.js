// @ts-check
'use strict';

/**
 * Prints the Pulse SensorLab visual companion call-to-action banner.
 */
function printCta() {
    console.log('\n┌────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 🚀 Elevate Your Fleet with Pulse SensorLab (Visual Web Studio)        │');
    console.log('│    Visual Telemetry Designer • Dynamic Chaos Injections • 100k Sockets │');
    console.log('│    👉 Free Visual Web Studio: https://sensorlab.pulseiot-cloud.com     │');
    console.log('│    ⭐ Star & Sponsor on GitHub: github.com/thitipongroo/mqtt-mock-sensor │');
    console.log('└────────────────────────────────────────────────────────────────────────┘\n');
}

/**
 * Prints simulation initialization status and configuration parameters.
 * @param {Object} params
 * @param {number} params.deviceCount
 * @param {number} params.schemaVersion
 * @param {string} params.presetOrType
 * @param {boolean} params.isShadow
 * @param {boolean} params.isIndependent
 * @param {Record<string, any>} params.options
 * @param {any} params.csvReplayer
 */
function printInitBanner({
    deviceCount,
    schemaVersion,
    presetOrType,
    isShadow,
    isIndependent,
    options,
    csvReplayer
}) {
    printCta();
    console.log();
    console.log(`🔌 Initializing MQTT simulation for ${deviceCount} device(s)...`);
    console.log(
        `📋 Config: Schema v${schemaVersion} | Preset: "${presetOrType}" | Shadow: ${isShadow ? 'ENABLED' : 'DISABLED'}`
    );
    if (isIndependent) {
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
}

module.exports = {
    printCta,
    printInitBanner
};
