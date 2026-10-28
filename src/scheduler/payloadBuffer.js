// @ts-check
'use strict';

const { generatePayload } = require('../payloadGenerator');

/**
 * @typedef {Object} BufferItem
 * @property {string} prefix
 * @property {string} suffix
 * @property {boolean} isEpoch
 * @property {string} [raw]
 * @property {boolean} [fallback]
 */

/**
 * Pre-generated Payload Ring Buffer to eliminate V8 GC pauses and JSON serialization overhead
 * during high-frequency telemetry streaming (10 - 100 Hz).
 */
class PreGeneratedPayloadBuffer {
    /**
     * @param {Object} params
     * @param {string[]} params.deviceList - Device identifier list
     * @param {string} [params.type] - Sensor preset/type
     * @param {Record<string, any>} [params.options] - Payload generator options
     * @param {string|null} [params.customTemplate] - Path or content of custom template
     * @param {any} [params.csvReplayer] - CSV replayer instance if active
     * @param {number} [params.poolSize=32] - Pool size per device
     */
    constructor({
        deviceList,
        type = 'env',
        options = {},
        customTemplate = null,
        csvReplayer = null,
        poolSize = 32
    }) {
        this.deviceList = deviceList || [];
        this.type = type;
        this.options = options || {};
        this.customTemplate = customTemplate;
        this.csvReplayer = csvReplayer;
        this.poolSize = poolSize;
        /** @type {Map<string, { pool: BufferItem[], cursor: number }>} */
        this.buffers = new Map();

        if (!this.csvReplayer) {
            this.initPools();
        }
    }

    /**
     * Initializes pre-generated payload pools for all devices.
     */
    initPools() {
        for (const devId of this.deviceList) {
            /** @type {BufferItem[]} */
            const pool = [];
            for (let i = 0; i < this.poolSize; i++) {
                const raw = generatePayload(this.type, {
                    ...this.options,
                    deviceId: devId,
                    template: this.customTemplate
                });

                const numMatch = raw.match(/"timestamp":(\d+)/);
                const strMatch = raw.match(/"timestamp":"([^"]+)"/);

                if (numMatch) {
                    const idx = raw.indexOf(numMatch[0]);
                    const prefix = raw.slice(0, idx + '"timestamp":'.length);
                    const suffix = raw.slice(idx + numMatch[0].length);
                    pool.push({ prefix, suffix, isEpoch: true });
                } else if (strMatch) {
                    const idx = raw.indexOf(strMatch[0]);
                    const prefix = raw.slice(0, idx + '"timestamp":'.length);
                    const suffix = raw.slice(idx + strMatch[0].length);
                    pool.push({ prefix, suffix, isEpoch: false });
                } else {
                    pool.push({ raw, fallback: true, prefix: '', suffix: '', isEpoch: false });
                }
            }
            this.buffers.set(devId, { pool, cursor: 0 });
        }
    }

    /**
     * Retrieves the next payload string with fast in-place timestamp injection.
     * @param {string} devId - Device ID
     * @returns {string} Serialized JSON payload string
     */
    getPayload(devId) {
        if (this.csvReplayer) {
            const rowPayload = this.csvReplayer.getNextPayload(devId);
            if (rowPayload) return rowPayload;
        }

        const entry = this.buffers.get(devId);
        if (!entry || !entry.pool || entry.pool.length === 0) {
            return generatePayload(this.type, {
                ...this.options,
                deviceId: devId,
                template: this.customTemplate
            });
        }

        const item = entry.pool[entry.cursor];
        entry.cursor = (entry.cursor + 1) % entry.pool.length;
        if (item.fallback && item.raw) return item.raw;

        const ts = item.isEpoch ? Date.now() : `"${new Date().toISOString()}"`;
        return item.prefix + ts + item.suffix;
    }
}

module.exports = {
    PreGeneratedPayloadBuffer
};
