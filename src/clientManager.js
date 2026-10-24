const mqtt = require('mqtt');
const fs = require('fs');

/**
 * Builds TLS connection options from provided CLI options.
 * @param {Object} options
 * @returns {Object}
 */
function buildTlsOptions(options = {}) {
    const tlsOptions = {};
    if (options.ca) tlsOptions.ca = fs.readFileSync(options.ca);
    if (options.cert) tlsOptions.cert = fs.readFileSync(options.cert);
    if (options.key) tlsOptions.key = fs.readFileSync(options.key);
    if (options.insecure) tlsOptions.rejectUnauthorized = false;
    return tlsOptions;
}

/**
 * Builds MQTT Last Will and Testament (LWT) configuration.
 * @param {string} devId
 * @param {Object} options
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

class ClientManager {
    constructor(broker, options = {}) {
        this.broker = broker;
        this.options = options;
        this.tlsOptions = buildTlsOptions(options);
        this.activeClients = [];
    }

    createClientOptions(devId, isPool = false) {
        const clientId = isPool
            ? `mock_sensor_pool_${Math.random().toString(16).substring(2, 10)}`
            : `mock_sensor_${devId}_${Math.random().toString(16).substring(2, 6)}`;

        const connOpts = {
            clientId,
            clean: true,
            connectTimeout: 5000,
            reconnectPeriod: 3000,
            ...this.tlsOptions
        };

        const username = this.options.runtimeUsername || this.options.username;
        const password = this.options.runtimePassword || this.options.password;
        if (username) connOpts.username = username;
        if (password) connOpts.password = password;

        const willDevId = isPool ? devId || 'mock-device' : devId;
        const will = getWillConfig(willDevId, this.options);
        if (will) connOpts.will = will;

        return connOpts;
    }

    connectClient(devId, isPool = false) {
        const connOpts = this.createClientOptions(devId, isPool);
        const client = mqtt.connect(this.broker, connOpts);
        this.activeClients.push(client);
        return client;
    }

    disconnectAll(callback) {
        let remaining = this.activeClients.length;
        if (remaining === 0) {
            if (callback) callback();
            return;
        }

        this.activeClients.forEach((c) => {
            c.end(false, () => {
                remaining -= 1;
                if (remaining <= 0 && callback) {
                    callback();
                }
            });
        });
    }
}

module.exports = {
    ClientManager,
    buildTlsOptions,
    getWillConfig
};
