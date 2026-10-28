// @ts-check
'use strict';

/**
 * shadowManager.js
 * Bi-directional Device Shadow synchronization manager
 */
class ShadowManager {
    /**
     * @param {any} client - MQTT Client instance
     * @param {string} orgId - Tenant/Organization UUID
     * @param {string} deviceId - Simulated Device ID
     * @param {Record<string, any>} [initialConfig={}] - Initial device state configuration
     * @param {((delta: Record<string, any>) => void)|null} [onConfigChange=null] - Delta update callback
     */
    constructor(client, orgId, deviceId, initialConfig = {}, onConfigChange = null) {
        this.client = client;
        this.orgId = orgId;
        this.deviceId = deviceId;
        this.onConfigChange = onConfigChange;

        this.updateTopic = `tenants/${orgId}/devices/${deviceId}/shadow/update`;
        this.deltaTopic = `tenants/${orgId}/devices/${deviceId}/shadow/update/delta`;
        this.acceptedTopic = `tenants/${orgId}/devices/${deviceId}/shadow/update/accepted`;
        this.rejectedTopic = `tenants/${orgId}/devices/${deviceId}/shadow/update/rejected`;

        this.reportedState = {
            samplingInterval: initialConfig.interval || 2000,
            status: 'ONLINE',
            firmwareVersion: '3.2.0',
            heaterEnabled: false,
            ...initialConfig.extraState
        };
    }

    /**
     * Subscribes to shadow delta, accepted, and rejected topics and syncs initial state.
     */
    init() {
        const topics = [this.deltaTopic, this.acceptedTopic, this.rejectedTopic];
        this.client.subscribe(topics, (/** @type {Error|null} */ err) => {
            if (err) {
                console.error(`❌ [Shadow:${this.deviceId}] Subscription error:`, err.message);
                return;
            }
            console.log(
                `📡 [Shadow:${this.deviceId}] Subscribed to Delta topic: ${this.deltaTopic}`
            );
            this.publishReportedState(this.reportedState, `init-${Date.now()}`);
        });

        // Manage received messages from Broker
        this.client.on('message', (/** @type {string} */ topic, /** @type {Buffer} */ message) => {
            if (topic === this.deltaTopic) {
                this.handleDelta(message.toString());
            } else if (topic === this.acceptedTopic) {
                // Debug log if accepted
            } else if (topic === this.rejectedTopic) {
                console.error(
                    `⚠️ [Shadow:${this.deviceId}] Shadow update rejected:`,
                    message.toString()
                );
            }
        });
    }

    /**
     * Publishes a reported state patch to the shadow update topic.
     * @param {Record<string, any>} reportedPatch
     * @param {string|null} [clientToken=null]
     */
    publishReportedState(reportedPatch, clientToken = null) {
        const payload = {
            state: {
                reported: reportedPatch
            },
            clientToken: clientToken || `token-${Date.now()}`
        };

        this.client.publish(
            this.updateTopic,
            JSON.stringify(payload),
            { qos: 1 },
            (/** @type {Error|null} */ err) => {
                if (err) {
                    console.error(
                        `❌ [Shadow:${this.deviceId}] Failed to publish reported state:`,
                        err.message
                    );
                } else {
                    console.log(`📤 [Shadow:${this.deviceId}] Reported state synced.`);
                }
            }
        );
    }

    /**
     * Handles incoming delta updates and notifies callbacks.
     * @param {string} rawMessage
     */
    handleDelta(rawMessage) {
        try {
            const data = JSON.parse(rawMessage);
            const deltaState = data.state || {};
            const version = data.version;

            console.log(
                `\n🔔 [Shadow:${this.deviceId}] Delta notification received (v${version}):`,
                JSON.stringify(deltaState)
            );

            Object.assign(this.reportedState, deltaState);

            if (this.onConfigChange) {
                this.onConfigChange(deltaState);
            }

            const ackPayload = {
                state: {
                    reported: deltaState
                },
                version: version,
                clientToken: `ack-v${version}-${Date.now()}`
            };

            this.client.publish(
                this.updateTopic,
                JSON.stringify(ackPayload),
                { qos: 1 },
                (/** @type {Error|null} */ err) => {
                    if (err) {
                        console.error(
                            `❌ [Shadow:${this.deviceId}] Failed to ack delta:`,
                            err.message
                        );
                    } else {
                        console.log(
                            `✅ [Shadow:${this.deviceId}] Reconciled & acknowledged delta (v${version})`
                        );
                    }
                }
            );
        } catch (e) {
            console.error(
                `⚠️ [Shadow:${this.deviceId}] Malformed delta message:`,
                /** @type {Error} */ (e).message
            );
        }
    }
}

module.exports = { ShadowManager };
