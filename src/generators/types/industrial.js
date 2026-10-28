// @ts-check
'use strict';

const { randomInRange } = require('../random');

/**
 * @typedef {Object} SensorReading
 * @property {number} value
 * @property {string} unit
 * @property {string} quality
 */

/**
 * Generates industrial smart factory readings (voltage, current, power, vibration, temperature).
 * @param {string} anomalyMode - Anomaly mode ('none', 'warning', 'critical', 'out-of-bounds')
 * @param {string} quality - Data quality ('GOOD', 'UNCERTAIN', 'BAD')
 * @returns {Record<string, SensorReading>} Prototype-less readings dictionary
 */
function generateIndustrialReadings(anomalyMode, quality) {
    let voltage = randomInRange(218.0, 222.0, 1);
    let current = randomInRange(4.0, 6.0);
    let power = parseFloat((voltage * current).toFixed(1));
    let vibration = randomInRange(0.02, 0.06, 3);
    let temp = randomInRange(35.0, 42.0);

    if (anomalyMode === 'warning') {
        voltage = 245.0;
        current = 9.5;
        power = parseFloat((voltage * current).toFixed(1));
        vibration = 3.2;
        temp = 65.0;
    } else if (anomalyMode === 'critical') {
        voltage = 270.0;
        current = 18.0;
        power = parseFloat((voltage * current).toFixed(1));
        vibration = 9.5;
        temp = randomInRange(360.0, 395.0);
    } else if (anomalyMode === 'out-of-bounds') {
        vibration = 150.0;
        voltage = 1200.0;
        temp = 550.0;
    }

    /** @type {Record<string, SensorReading>} */
    const readings = Object.create(null);
    readings.VOLTAGE_V = Object.assign(Object.create(null), { value: voltage, unit: 'V', quality });
    readings.CURRENT_A = Object.assign(Object.create(null), { value: current, unit: 'A', quality });
    readings.POWER_W = Object.assign(Object.create(null), { value: power, unit: 'W', quality });
    readings.VIBRATION_G = Object.assign(Object.create(null), {
        value: vibration,
        unit: 'g',
        quality
    });
    readings.TEMPERATURE = Object.assign(Object.create(null), { value: temp, unit: '°C', quality });
    return readings;
}

module.exports = {
    generateIndustrialReadings
};
