// @ts-check
'use strict';

/**
 * @typedef {Object} GpsState
 * @property {number} latitude
 * @property {number} longitude
 * @property {number} speed
 */

/**
 * @typedef {Object} SensorReading
 * @property {number} value
 * @property {string} unit
 * @property {string} quality
 */

/** @type {Map<string, GpsState>} */
const deviceGpsStates = new Map();

/**
 * Retrieves or initializes current GPS state for a device.
 * @param {string} devId - Device identifier
 * @returns {GpsState} Current GPS coordinates and speed
 */
function getDeviceGps(devId) {
    let state = deviceGpsStates.get(devId);
    if (!state) {
        state = {
            latitude: 13.7563 + (Math.random() - 0.5) * 0.05,
            longitude: 100.5018 + (Math.random() - 0.5) * 0.05,
            speed: 30.0 + Math.random() * 20.0
        };
        deviceGpsStates.set(devId, state);
    }
    return state;
}

/**
 * Generates GPS readings from device state.
 * @param {GpsState} gps - GPS state
 * @param {string} quality - Data quality
 * @returns {Record<string, SensorReading>} Prototype-less readings dictionary
 */
function generateGpsReadings(gps, quality) {
    /** @type {Record<string, SensorReading>} */
    const readings = Object.create(null);
    readings.LATITUDE = Object.assign(Object.create(null), {
        value: parseFloat(gps.latitude.toFixed(6)),
        unit: '°',
        quality
    });
    readings.LONGITUDE = Object.assign(Object.create(null), {
        value: parseFloat(gps.longitude.toFixed(6)),
        unit: '°',
        quality
    });
    readings.SPEED = Object.assign(Object.create(null), {
        value: parseFloat(gps.speed.toFixed(2)),
        unit: 'km/h',
        quality
    });
    return readings;
}

module.exports = {
    getDeviceGps,
    generateGpsReadings,
    deviceGpsStates
};
