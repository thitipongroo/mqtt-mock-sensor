// @ts-check
'use strict';

const { randomInRange } = require('./generators/random');
const { isDangerousKey, sanitizeObject, safeJsonParse } = require('./generators/sanitizer');
const { generateEnvReadings } = require('./generators/types/env');
const { generateIndustrialReadings } = require('./generators/types/industrial');
const { generateAirReadings } = require('./generators/types/air');
const { getDeviceGps, generateGpsReadings } = require('./generators/types/gps');
const { generateEdgeMetadata } = require('./generators/types/edge');

/**
 * @typedef {Object} PayloadOptions
 * @property {string} [deviceId] - Device identifier
 * @property {number|string} [schemaVersion] - Telemetry schema version (1 or 2)
 * @property {string} [preset] - Telemetry preset name
 * @property {number} [anomalyRate] - Probability percentage of anomaly (0-100)
 * @property {string} [anomalyType] - Anomaly type ('critical', 'warning', 'quality', 'out-of-bounds')
 * @property {string} [template] - Custom template string
 * @property {string} [orgId] - Organization / Tenant UUID
 * @property {boolean} [epochTimestamp] - Force numeric timestamp
 */

/**
 * Builds Schema v2 structured telemetry readings.
 * @param {string} preset - Domain preset name
 * @param {string} anomalyMode - Anomaly mode
 * @param {string} quality - Quality level
 * @param {import('./generators/types/gps').GpsState} gps - GPS state
 * @returns {Record<string, any>}
 */
function buildV2Readings(preset, anomalyMode, quality, gps) {
    switch (preset) {
        case 'sentinel-industrial':
        case 'industrial':
        case 'power':
            return generateIndustrialReadings(anomalyMode, quality);
        case 'sentinel-air':
        case 'air':
            return generateAirReadings(anomalyMode, quality);
        case 'gps':
            return generateGpsReadings(gps, quality);
        case 'sentinel-env':
        case 'env':
        default:
            return generateEnvReadings(anomalyMode, quality);
    }
}

/**
 * Populates Schema v1 legacy flat readings.
 * @param {Record<string, any>} payload - Target payload object
 * @param {string} preset - Domain preset
 * @param {string} anomalyMode - Anomaly mode
 * @param {import('./generators/types/gps').GpsState} gps - GPS state
 */
function populateV1Readings(payload, preset, anomalyMode, gps) {
    switch (preset) {
        case 'gps':
            payload.latitude = parseFloat(gps.latitude.toFixed(6));
            payload.longitude = parseFloat(gps.longitude.toFixed(6));
            payload.speed = parseFloat(gps.speed.toFixed(2));
            break;
        case 'sentinel-industrial':
        case 'industrial':
        case 'power': {
            const isCrit = anomalyMode === 'critical';
            payload.voltage = isCrit ? 380.0 : randomInRange(210.0, 230.0);
            payload.current = randomInRange(1.0, 10.0);
            payload.power = parseFloat((payload.voltage * payload.current).toFixed(2));
            break;
        }
        case 'sentinel-env':
        case 'env':
        default: {
            if (anomalyMode === 'critical') {
                payload.temperature = 99.9;
                payload.humidity = 95.0;
                payload.smokePpm = 25.0;
            } else if (anomalyMode === 'out-of-bounds') {
                payload.temperature = 250.0;
                payload.humidity = -10.0;
            } else {
                payload.temperature = randomInRange(20.0, 35.0);
                payload.humidity = randomInRange(40.0, 80.0);
                payload.smokePpm = 0.0;
            }
            break;
        }
    }
}

/**
 * Generates an IoT sensor telemetry payload in JSON format.
 * @param {string} [type='env'] - Primary sensor type
 * @param {PayloadOptions} [options={}] - Generation options
 * @returns {string} Serialized JSON payload string
 */
function generatePayload(type = 'env', options = {}) {
    const devId = options.deviceId || 'mock-device-001';
    const schemaVersion = options.schemaVersion ? parseInt(String(options.schemaVersion), 10) : 1;
    const preset = (options.preset || type || 'env').toLowerCase();

    const isAnomaly = Boolean(options.anomalyRate && Math.random() * 100 < options.anomalyRate);
    let anomalyMode = 'none';
    let quality = 'GOOD';

    if (isAnomaly) {
        anomalyMode = options.anomalyType || 'critical';
        if (anomalyMode === 'quality') {
            quality = Math.random() > 0.5 ? 'UNCERTAIN' : 'BAD';
        }
    }

    if (options.template) {
        const rendered = options.template
            .replace(/\{\{timestamp\}\}/g, () => new Date().toISOString())
            .replace(/\{\{epochMs\}\}/g, () => String(Date.now()))
            .replace(/\{\{deviceId\}\}/g, () => devId)
            .replace(/\{\{randomInt\}\}/g, () => String(Math.floor(Math.random() * 100)))
            .replace(/\{\{randomFloat\}\}/g, () => (Math.random() * 100).toFixed(2));

        try {
            return JSON.stringify(safeJsonParse(rendered));
        } catch {
            return rendered;
        }
    }

    const gps = getDeviceGps(devId);
    if (preset === 'gps') {
        gps.latitude += (Math.random() - 0.5) * 0.001;
        gps.longitude += (Math.random() - 0.5) * 0.001;
        gps.speed = Math.max(0, Math.min(120, gps.speed + (Math.random() - 0.5) * 5));
    }

    const timestamp =
        schemaVersion >= 2 || options.epochTimestamp ? Date.now() : new Date().toISOString();

    if (schemaVersion >= 2) {
        /** @type {Record<string, any>} */
        const payloadV2 = Object.create(null);
        payloadV2.deviceId = devId;
        payloadV2.schemaVersion = 2;
        payloadV2.timestamp = timestamp;
        payloadV2.readings = buildV2Readings(preset, anomalyMode, quality, gps);
        payloadV2.edge = generateEdgeMetadata();
        if (options.orgId) payloadV2.organizationId = options.orgId;

        return JSON.stringify(payloadV2);
    }

    /** @type {Record<string, any>} */
    const payloadV1 = Object.create(null);
    payloadV1.deviceId = devId;
    payloadV1.timestamp = timestamp;
    if (options.orgId) payloadV1.organizationId = options.orgId;
    populateV1Readings(payloadV1, preset, anomalyMode, gps);

    return JSON.stringify(payloadV1);
}

module.exports = {
    generatePayload,
    sanitizeObject,
    isDangerousKey,
    safeJsonParse
};
