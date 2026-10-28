// @ts-check
'use strict';

/**
 * @typedef {Object} EdgeMetadata
 * @property {string} firmwareVersion
 * @property {number} rssi
 * @property {number} batteryPct
 * @property {number} uptimeSeconds
 * @property {string} protocol
 */

/**
 * Generates edge device hardware telemetry and diagnostic metadata.
 * @returns {EdgeMetadata} Prototype-less edge diagnostics object
 */
function generateEdgeMetadata() {
    /** @type {EdgeMetadata} */
    const edge = Object.create(null);
    edge.firmwareVersion = '3.2.0';
    edge.rssi = -60 - Math.floor(Math.random() * 25);
    edge.batteryPct = Math.floor(Math.random() * 20 + 80);
    edge.uptimeSeconds = Math.floor(process.uptime());
    edge.protocol = 'MQTT';
    return edge;
}

module.exports = {
    generateEdgeMetadata
};
