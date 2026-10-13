/**
 * shadowManager.js
 */
class ShadowManager {
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

    init() {
        const topics = [this.deltaTopic, this.acceptedTopic, this.rejectedTopic];
        this.client.subscribe(topics, (err) => {
            if (err) {
                console.error(`❌ [Shadow:${this.deviceId}] Subscription error:`, err.message);
                return;
            }
            console.log(
                `📡 [Shadow:${this.deviceId}] Subscribed to Delta topic: ${this.deltaTopic}`
            );
            this.publishReportedState(this.reportedState, `init-${Date.now()}`);
        });

        // manage recieve message from Broker
        this.client.on('message', (topic, message) => {
            if (topic === this.deltaTopic) {
                this.handleDelta(message.toString());
            } else if (topic === this.acceptedTopic) {
                // Log debug accepted
            } else if (topic === this.rejectedTopic) {
                console.error(
                    `⚠️ [Shadow:${this.deviceId}] Shadow update rejected:`,
                    message.toString()
                );
            }
        });
    }

    publishReportedState(reportedPatch, clientToken = null) {
        const payload = {
            state: {
                reported: reportedPatch
            },
            clientToken: clientToken || `token-${Date.now()}`
        };

        this.client.publish(this.updateTopic, JSON.stringify(payload), { qos: 1 }, (err) => {
            if (err) {
                console.error(
                    `❌ [Shadow:${this.deviceId}] Failed to publish reported state:`,
                    err.message
                );
            } else {
                console.log(`📤 [Shadow:${this.deviceId}] Reported state synced.`);
            }
        });
    }

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

            this.client.publish(this.updateTopic, JSON.stringify(ackPayload), { qos: 1 }, (err) => {
                if (err) {
                    console.error(`❌ [Shadow:${this.deviceId}] Failed to ack delta:`, err.message);
                } else {
                    console.log(
                        `✅ [Shadow:${this.deviceId}] Reconciled & acknowledged delta (v${version})`
                    );
                }
            });
        } catch (e) {
            console.error(`⚠️ [Shadow:${this.deviceId}] Malformed delta message:`, e.message);
        }
    }
}

module.exports = { ShadowManager };
