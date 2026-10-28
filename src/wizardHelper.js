// @ts-check
'use strict';

const readline = require('readline');

/**
 * Creates a readline prompt promise.
 * @param {readline.Interface} rl
 * @param {string} questionText
 * @returns {Promise<string>}
 */
function ask(rl, questionText) {
    return new Promise((resolve) => {
        try {
            rl.question(questionText, (answer) => {
                resolve((answer || '').trim());
            });
        } catch {
            resolve('');
        }
    });
}

/**
 * Parses user input for sensor type choice.
 * @param {string} input
 * @returns {{ type: string, preset: string|null }}
 */
function parseSensorChoice(input) {
    const val = input.toLowerCase();
    if (val === '2' || val === 'industrial' || val === 'factory') {
        return { type: 'power', preset: 'industrial' };
    }
    if (val === '3' || val === 'gps' || val === 'vehicle') {
        return { type: 'gps', preset: null };
    }
    return { type: 'env', preset: 'env' };
}

/**
 * Parses user input for broker choice.
 * @param {readline.Interface} rl
 * @param {string} input
 * @returns {Promise<string>}
 */
async function parseBrokerChoice(rl, input) {
    if (input === '2' || input.toLowerCase() === 'custom') {
        const customUrl = await ask(
            rl,
            '   👉 Enter Broker URL [default: mqtt://localhost:1883]: '
        );
        return customUrl || 'mqtt://localhost:1883';
    }
    return 'mqtts://broker.hivemq.com:8883';
}

/**
 * Parses device count input.
 * @param {string} input
 * @returns {number}
 */
function parseDeviceCount(input) {
    const parsed = parseInt(input, 10);
    if (!isNaN(parsed) && parsed > 0) {
        return Math.min(parsed, 1000);
    }
    return 1;
}

/**
 * Interactive Setup Wizard for beginners.
 * @param {any} [inputStream=process.stdin]
 * @param {any} [outputStream=process.stdout]
 * @returns {Promise<{ type: string, preset: string|null, broker: string, devices: number }>}
 */
async function runWizard(inputStream = process.stdin, outputStream = process.stdout) {
    const rl = readline.createInterface({
        input: inputStream,
        output: outputStream
    });

    try {
        outputStream.write('\n');
        outputStream.write('╔══════════════════════════════════════════════════════════════╗\n');
        outputStream.write('║       ⚡ Welcome to MQTT Mock Sensor Setup Wizard ⚡           ║\n');
        outputStream.write('╚══════════════════════════════════════════════════════════════╝\n');
        outputStream.write('Quick interactive setup (Press Ctrl+C to cancel)\n\n');

        // Question 1: Sensor Type
        outputStream.write('1️⃣  Select Sensor Type:\n');
        outputStream.write('    [1] Environmental (Temperature, Humidity) - Default\n');
        outputStream.write('    [2] Industrial / Smart Factory (Voltage, Vibration, Power)\n');
        outputStream.write('    [3] GPS / Vehicle Fleet (Latitude, Longitude, Speed)\n');
        const sensorAnswer = await ask(rl, '    Your Choice [1-3, default: 1]: ');
        const sensorConfig = parseSensorChoice(sensorAnswer);

        // Question 2: Broker URL
        outputStream.write('\n2️⃣  Choose MQTT Broker Destination:\n');
        outputStream.write('    [1] HiveMQ Cloud Public Sandbox (Free & Instant) - Default\n');
        outputStream.write('    [2] Custom Broker (e.g. localhost, AWS IoT, EMQX)\n');
        const brokerAnswer = await ask(rl, '    Your Choice [1-2, default: 1]: ');
        const brokerUrl = await parseBrokerChoice(rl, brokerAnswer);

        // Question 3: Device Count
        outputStream.write('\n3️⃣  Number of Simulated Devices:\n');
        const countAnswer = await ask(rl, '    Enter device count (1 - 100) [default: 1]: ');
        const devices = parseDeviceCount(countAnswer);

        outputStream.write('\n✨ Setup Complete! Launching simulation...\n\n');

        return {
            type: sensorConfig.type,
            preset: sensorConfig.preset,
            broker: brokerUrl,
            devices
        };
    } finally {
        rl.close();
    }
}

module.exports = {
    runWizard,
    parseSensorChoice,
    parseBrokerChoice,
    parseDeviceCount
};
