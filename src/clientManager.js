// @ts-check
'use strict';

const mqtt = require('mqtt');
const {
    ALLOWED_PROTOCOLS,
    isLoopbackOrLinkLocal,
    validateBrokerUrl
} = require('./network/validator');
const { PacketQueue } = require('./network/packetQueue');
const { buildTlsOptions, getWillConfig } = require('./network/configBuilder');

class ClientManager {
    /**
     * @param {string} broker - Target MQTT Broker URI
     * @param {Record<string, any>} [options={}] - Manager configuration options
     */
    constructor(broker, options = {}) {
        validateBrokerUrl(broker, options.allowLocal);
        this.broker = broker;
        this.options = options;
        this.tlsOptions = buildTlsOptions(options);
        /** @type {any[]} */
        this.activeClients = [];
        this.packetQueue = new PacketQueue(this);
    }

    /**
     * Creates connection parameters for an individual or pooled device.
     * @param {string} devId - Device identifier
     * @param {boolean} [isPool=false] - Whether this socket connects for a device pool
     * @returns {Record<string, any>}
     */
    createClientOptions(devId, isPool = false) {
        const clientId = isPool
            ? `mock_sensor_pool_${Math.random().toString(16).substring(2, 10)}`
            : `mock_sensor_${devId}_${Math.random().toString(16).substring(2, 6)}`;

        /** @type {Record<string, any>} */
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

    /**
     * Connects an MQTT client and registers it in active clients.
     * @param {string} devId - Device identifier
     * @param {boolean} [isPool=false]
     * @returns {any}
     */
    connectClient(devId, isPool = false) {
        const connOpts = this.createClientOptions(devId, isPool);
        const client = mqtt.connect(this.broker, connOpts);
        this.activeClients.push(client);
        return client;
    }

    /**
     * Publishes a message either directly or routed through the packet queue.
     * @param {any} client
     * @param {string} topic
     * @param {string|Buffer} message
     * @param {Record<string, any>} [options={}]
     * @param {Function} [callback]
     */
    publish(client, topic, message, options = {}, callback) {
        if (this.options.batching) {
            this.packetQueue.enqueue(client, topic, message, options, callback);
        } else {
            client.publish(topic, message, options, callback);
        }
    }

    /**
     * Batches multiple packet writes continuously through socket with cork/uncork.
     * @param {any} client
     * @param {Array<any>} packets
     * @param {Function} [callback]
     */
    publishBatch(client, packets, callback) {
        if (!packets || packets.length === 0) {
            if (callback) callback();
            return;
        }

        const hasCork = client && client.stream && typeof client.stream.cork === 'function';
        if (hasCork) {
            try {
                client.stream.cork();
            } catch {
                // Ignore if socket not writable
            }
        }

        for (const pkt of packets) {
            try {
                client.publish(pkt.topic, pkt.message, pkt.options || {}, pkt.callback);
            } catch (err) {
                if (pkt.callback) pkt.callback(err);
            }
        }

        if (hasCork && typeof client.stream.uncork === 'function') {
            try {
                client.stream.uncork();
            } catch {
                // Ignore if socket not writable
            }
        }

        if (callback) callback();
    }

    /**
     * Disconnects all managed clients with graceful DISCONNECT packet and safety timeout.
     * @param {Function} [callback]
     */
    disconnectAll(callback) {
        this.packetQueue.flush();
        const clientsToClose = [...this.activeClients];
        let remaining = clientsToClose.length;
        if (remaining === 0) {
            this.activeClients = [];
            if (callback) callback();
            return;
        }

        let isDone = false;
        const done = () => {
            if (!isDone) {
                isDone = true;
                this.activeClients = [];
                if (callback) callback();
            }
        };

        const timeoutHandle = setTimeout(() => {
            clientsToClose.forEach((c) => {
                try {
                    c.end(true);
                } catch {
                    // Ignore force-disconnect errors
                }
            });
            done();
        }, 3000);
        if (timeoutHandle.unref) timeoutHandle.unref();

        clientsToClose.forEach((c) => {
            try {
                c.end(false, () => {
                    remaining -= 1;
                    if (remaining <= 0) {
                        clearTimeout(timeoutHandle);
                        done();
                    }
                });
            } catch {
                remaining -= 1;
                if (remaining <= 0) {
                    clearTimeout(timeoutHandle);
                    done();
                }
            }
        });
    }
}

module.exports = {
    ClientManager,
    PacketQueue,
    buildTlsOptions,
    getWillConfig,
    validateBrokerUrl,
    isLoopbackOrLinkLocal,
    ALLOWED_PROTOCOLS
};
