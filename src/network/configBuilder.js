// @ts-check
'use strict';

const fs = require('fs');

/**
 * Builds TLS connection options from provided CLI options.
 * @param {Record<string, any>} [options={}]
 * @returns {Record<string, any>}
 */
function buildTlsOptions(options = {}) {
    /** @type {Record<string, any>} */
    const tlsOptions = {};
    if (options.ca) {
        tlsOptions.ca = Buffer.isBuffer(options.ca) ? options.ca : fs.readFileSync(options.ca);
    }
    if (options.cert) {
        tlsOptions.cert = Buffer.isBuffer(options.cert)
            ? options.cert
            : fs.readFileSync(options.cert);
    }
    if (options.key) {
        tlsOptions.key = Buffer.isBuffer(options.key) ? options.key : fs.readFileSync(options.key);
    }
    if (options.insecure) tlsOptions.rejectUnauthorized = false;
    if (options.rejectUnauthorized !== undefined) {
        tlsOptions.rejectUnauthorized = options.rejectUnauthorized;
    }
    return tlsOptions;
}

/**
 * Builds MQTT Last Will and Testament (LWT) configuration.
 * @param {string} devId
 * @param {Record<string, any>} [options={}]
 * @returns {Object|null}
 */
function getWillConfig(devId, options = {}) {
    if (!options.willTopic) return null;
    const willTopic = options.willTopic
        .replace(/\{deviceId\}/g, devId)
        .replace(/\{orgId\}/g, options.orgId || '');
    const defaultWillMsg = JSON.stringify({
        status: 'OFFLINE',
        deviceId: devId,
        timestamp: new Date().toISOString()
    });
    const willPayload = (options.willMessage || defaultWillMsg)
        .replace(/\{deviceId\}/g, devId)
        .replace(/\{orgId\}/g, options.orgId || '');
    return {
        topic: willTopic,
        payload: Buffer.from(willPayload),
        qos: options.willQos !== undefined ? options.willQos : 0,
        retain: Boolean(options.willRetain)
    };
}

module.exports = {
    buildTlsOptions,
    getWillConfig
};
