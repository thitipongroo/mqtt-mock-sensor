// @ts-check
'use strict';

/**
 * @typedef {Object} QueuedPacket
 * @property {any} client - MQTT client instance
 * @property {string} topic - MQTT topic
 * @property {string|Buffer} message - Payload message
 * @property {Record<string, any>} [options] - Publish options
 * @property {Function} [callback] - Callback executed on publish ack
 */

/**
 * High-Throughput Packet Queue for batching MQTT packet writes.
 */
class PacketQueue {
    /**
     * @param {any} clientManager - Client manager instance providing publishBatch
     * @param {number} [batchSize=100] - Maximum packet batch size
     */
    constructor(clientManager, batchSize = 100) {
        this.clientManager = clientManager;
        this.batchSize = batchSize;
        /** @type {QueuedPacket[]} */
        this.queue = [];
        this.flushScheduled = false;
    }

    /**
     * Enqueues an outgoing packet for batch writing.
     * @param {any} client - MQTT client
     * @param {string} topic - MQTT topic
     * @param {string|Buffer} message - Telemetry payload
     * @param {Record<string, any>} [options={}] - Publish QoS / retain options
     * @param {Function} [callback] - Acknowledgement callback
     */
    enqueue(client, topic, message, options = {}, callback) {
        this.queue.push({ client, topic, message, options, callback });
        if (!this.flushScheduled) {
            this.flushScheduled = true;
            queueMicrotask(() => this.flush());
        }
    }

    /**
     * Flushes currently queued packets grouped by client socket.
     */
    flush() {
        this.flushScheduled = false;
        if (this.queue.length === 0) return;

        const batch = this.queue.splice(0, this.queue.length);
        /** @type {Map<any, QueuedPacket[]>} */
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

module.exports = {
    PacketQueue
};
