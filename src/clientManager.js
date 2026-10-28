const mqtt = require('mqtt');
const fs = require('fs');

const ALLOWED_PROTOCOLS = new Set(['mqtt:', 'mqtts:', 'ws:', 'wss:']);

/**
 * Checks whether an IP or hostname is a loopback or link-local address.
 * @param {string} hostname
 * @returns {boolean}
 */
function isLoopbackOrLinkLocal(hostname) {
    if (!hostname || typeof hostname !== 'string') return false;
    let host = hostname.toLowerCase().trim();

    // Remove IPv6 brackets e.g. [::1] -> ::1
    if (host.startsWith('[') && host.endsWith(']')) {
        host = host.slice(1, -1);
    }

    // Direct match against known local names or suffixes
    if (
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host.endsWith('.local') ||
        host === 'metadata.google.internal'
    ) {
        return true;
    }

    // IPv6 loopback / unspecified
    if (
        host === '::1' ||
        host === '::' ||
        host === '0:0:0:0:0:0:0:1' ||
        host === '0:0:0:0:0:0:0:0'
    ) {
        return true;
    }

    // IPv6 link-local prefix: fe80::/10 (fe80 - febf)
    if (/^fe[89ab][0-9a-f]:/i.test(host)) {
        return true;
    }

    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:169.254.169.254)
    if (host.startsWith('::ffff:')) {
        host = host.slice(7);
    }

    // Parse potential IPv4 address formats (decimal, octal, hex, compact integers)
    const parts = host.split('.');
    if (parts.length >= 1 && parts.length <= 4) {
        const nums = [];
        for (const part of parts) {
            if (!part) return false;
            let n;
            if (part.startsWith('0x') || part.startsWith('0X')) {
                n = parseInt(part, 16);
            } else if (part.startsWith('0') && part.length > 1 && /^\d+$/.test(part)) {
                n = parseInt(part, 8);
            } else if (/^\d+$/.test(part)) {
                n = parseInt(part, 10);
            } else {
                return false;
            }
            if (isNaN(n) || n < 0) return false;
            nums.push(n);
        }

        let val;
        if (nums.length === 1) {
            val = nums[0];
        } else if (nums.length === 2) {
            if (nums[0] > 255 || nums[1] > 0xffffff) return false;
            val = (nums[0] << 24) | nums[1];
        } else if (nums.length === 3) {
            if (nums[0] > 255 || nums[1] > 255 || nums[2] > 0xffff) return false;
            val = (nums[0] << 24) | (nums[1] << 16) | nums[2];
        } else if (nums.length === 4) {
            if (nums.some((x) => x > 255)) return false;
            val = ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
        }
        val = val >>> 0;

        const firstOctet = (val >>> 24) & 0xff;
        const firstTwo = (val >>> 16) & 0xffff;

        // 127.0.0.0/8 (Loopback), 0.0.0.0/8 (Current network)
        if (firstOctet === 127 || firstOctet === 0) return true;
        // 169.254.0.0/16 (Link-local / Cloud Metadata)
        if (firstTwo === ((169 << 8) | 254)) return true;
    }

    return false;
}

/**
 * Validates broker URL scheme and prevents SSRF to local/metadata endpoints.
 * @param {string} brokerUrl
 * @param {boolean|Object} optionsOrAllowLocal
 * @returns {URL}
 */
function validateBrokerUrl(brokerUrl, optionsOrAllowLocal = false) {
    if (!brokerUrl || typeof brokerUrl !== 'string') {
        throw new Error('Broker URL is required and must be a string.');
    }

    const allowLocal =
        typeof optionsOrAllowLocal === 'boolean'
            ? optionsOrAllowLocal
            : Boolean(optionsOrAllowLocal && optionsOrAllowLocal.allowLocal);

    let parsed;
    try {
        parsed = new URL(brokerUrl);
    } catch (err) {
        throw new Error(`Invalid broker URL format "${brokerUrl}": ${err.message}`, { cause: err });
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
        throw new Error(
            `Invalid broker protocol "${parsed.protocol}". Allowed protocols are: mqtt://, mqtts://, ws://, wss://`
        );
    }

    if (!allowLocal && isLoopbackOrLinkLocal(parsed.hostname)) {
        throw new Error(
            `Connection to loopback or link-local address "${parsed.hostname}" is blocked for SSRF prevention. Use --allow-local to permit.`
        );
    }

    return parsed;
}

/**
 * Builds TLS connection options from provided CLI options.
 * @param {Object} options
 * @returns {Object}
 */
function buildTlsOptions(options = {}) {
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

/**
 * High-Throughput Packet Queue for batching MQTT packet writes.
 */
class PacketQueue {
    constructor(clientManager, batchSize = 100) {
        this.clientManager = clientManager;
        this.batchSize = batchSize;
        this.queue = [];
        this.flushScheduled = false;
    }

    enqueue(client, topic, message, options = {}, callback) {
        this.queue.push({ client, topic, message, options, callback });
        if (!this.flushScheduled) {
            this.flushScheduled = true;
            queueMicrotask(() => this.flush());
        }
    }

    flush() {
        this.flushScheduled = false;
        if (this.queue.length === 0) return;

        const batch = this.queue.splice(0, this.queue.length);
        const byClient = new Map();
        for (const item of batch) {
            let list = byClient.get(item.client);
            if (!list) {
                list = [];
                byClient.set(item.client, list);
            }
            list.push(item);
        }

        for (const [client, items] of byClient.entries()) {
            this.clientManager.publishBatch(client, items);
        }
    }
}

class ClientManager {
    constructor(broker, options = {}) {
        validateBrokerUrl(broker, options.allowLocal);
        this.broker = broker;
        this.options = options;
        this.tlsOptions = buildTlsOptions(options);
        this.activeClients = [];
        this.packetQueue = new PacketQueue(this);
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

    /**
     * Publishes a single message with optional queue batching.
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
     * @param {Object} client - MQTT client instance
     * @param {Array<Object>} packets - Array of { topic, message, options, callback }
     * @param {Function} [callback] - Callback executed when batch is written
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
                // Ignore if stream is not in writable state
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
                // Ignore if stream is not in writable state
            }
        }

        if (callback) callback();
    }

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

        // Safety timeout to avoid hanging on unresponsive or half-open sockets
        const timeoutHandle = setTimeout(() => {
            clientsToClose.forEach((c) => {
                try {
                    c.end(true);
                } catch {
                    // Ignore force-disconnect errors during timeout abort
                }
            });
            done();
        }, 3000);
        if (timeoutHandle.unref) timeoutHandle.unref();

        clientsToClose.forEach((c) => {
            try {
                // c.end(false, ...) cleanly sends MQTT DISCONNECT packet
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
