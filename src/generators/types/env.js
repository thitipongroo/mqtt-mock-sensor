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
 * Generates environmental readings (temperature, humidity, smoke, co2, pressure).
 * @param {string} anomalyMode - Anomaly mode ('none', 'warning', 'critical', 'out-of-bounds')
 * @param {string} quality - Data quality ('GOOD', 'UNCERTAIN', 'BAD')
 * @returns {Record<string, SensorReading>} Prototype-less readings dictionary
 */
function generateEnvReadings(anomalyMode, quality) {
    let temp = randomInRange(22.0, 27.0);
    let hum = randomInRange(50.0, 65.0);
    let smoke = randomInRange(0.01, 0.05);
    const co2 = randomInRange(400.0, 550.0, 1);
    const pressure = randomInRange(1012.0, 1015.0, 1);

    if (anomalyMode === 'warning') {
        temp = randomInRange(38.0, 44.0);
        hum = randomInRange(75.0, 85.0);
        smoke = randomInRange(3.0, 5.0);
    } else if (anomalyMode === 'critical') {
        temp = randomInRange(65.0, 85.0);
        hum = randomInRange(90.0, 98.0);
        smoke = randomInRange(25.0, 50.0);
    } else if (anomalyMode === 'out-of-bounds') {
        temp = 250.0;
        hum = -10.0;
    }

    /** @type {Record<string, SensorReading>} */
    const readings = Object.create(null);
    readings.TEMPERATURE = Object.assign(Object.create(null), { value: temp, unit: '°C', quality });
    readings.HUMIDITY = Object.assign(Object.create(null), { value: hum, unit: '%RH', quality });
    readings.SMOKE_PPM = Object.assign(Object.create(null), {
        value: smoke,
        unit: 'ppm',
        quality
    });
    readings.CO2_PPM = Object.assign(Object.create(null), { value: co2, unit: 'ppm', quality });
    readings.PRESSURE = Object.assign(Object.create(null), {
        value: pressure,
        unit: 'hPa',
        quality
    });
    return readings;
}

module.exports = {
    generateEnvReadings
};
