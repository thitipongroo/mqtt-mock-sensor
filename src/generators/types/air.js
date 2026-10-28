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
 * Generates air quality readings (PM2.5, PM10, VOC index, CO2, O3).
 * @param {string} anomalyMode - Anomaly mode ('none', 'warning', 'critical', 'out-of-bounds')
 * @param {string} quality - Data quality ('GOOD', 'UNCERTAIN', 'BAD')
 * @returns {Record<string, SensorReading>} Prototype-less readings dictionary
 */
function generateAirReadings(anomalyMode, quality) {
    let pm25 = randomInRange(10.0, 25.0, 1);
    let pm10 = randomInRange(20.0, 40.0, 1);
    let voc = randomInRange(50.0, 100.0, 0);
    let co2 = randomInRange(420.0, 580.0, 1);
    let o3 = randomInRange(15.0, 30.0, 1);

    if (anomalyMode === 'warning') {
        pm25 = 75.0;
        pm10 = 110.0;
        voc = 220.0;
    } else if (anomalyMode === 'critical') {
        pm25 = 180.0;
        pm10 = 260.0;
        voc = 450.0;
        co2 = 2800.0;
    } else if (anomalyMode === 'out-of-bounds') {
        pm25 = 800.0;
    }

    /** @type {Record<string, SensorReading>} */
    const readings = Object.create(null);
    readings.PM25 = Object.assign(Object.create(null), { value: pm25, unit: 'µg/m³', quality });
    readings.PM10 = Object.assign(Object.create(null), { value: pm10, unit: 'µg/m³', quality });
    readings.VOC_INDEX = Object.assign(Object.create(null), {
        value: voc,
        unit: 'index',
        quality
    });
    readings.CO2_PPM = Object.assign(Object.create(null), { value: co2, unit: 'ppm', quality });
    readings.O3_PPB = Object.assign(Object.create(null), { value: o3, unit: 'ppb', quality });
    return readings;
}

module.exports = {
    generateAirReadings
};
