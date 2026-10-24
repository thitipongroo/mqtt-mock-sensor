const { generatePayload } = require('./payloadGenerator');
const { ShadowManager } = require('./shadowManager');

function printCta() {
    console.log('⭐ Enjoying mqtt-mock-sensor? Star us on GitHub & consider Sponsoring!');
    console.log(
        '🚀 Want a Visual Web Dashboard with 100k scale? Join waitlist: https://pulseiot-cloud.com'
    );
}

class SimulationRunner {
    constructor({
        options,
        deviceList,
        targetTopicTemplate,
        effectiveSchemaVersion,
        customTemplate = null,
        csvReplayer = null,
        clientManager,
        onExit = null
    }) {
        this.options = options;
        this.deviceList = deviceList;
        this.targetTopicTemplate = targetTopicTemplate;
        this.effectiveSchemaVersion = effectiveSchemaVersion;
        this.customTemplate = customTemplate;
        this.csvReplayer = csvReplayer;
        this.clientManager = clientManager;
        this.onExit = onExit;

        this.activeIntervals = new Map();
        this.publishedCounts = new Map();
        this.deviceList.forEach((d) => this.publishedCounts.set(d, 0));
        this.isShuttingDown = false;
    }

    buildPayload(devId) {
        if (this.csvReplayer) {
            const rowPayload = this.csvReplayer.getNextPayload(devId);
            if (rowPayload) return rowPayload;
        }
        return generatePayload(this.options.type, {
            deviceId: devId,
            template: this.customTemplate,
            preset: this.options.preset,
            anomalyRate: this.options.anomalyRate,
            anomalyType: this.options.anomalyType,
            schemaVersion: this.effectiveSchemaVersion,
            orgId: this.options.orgId,
            epochTimestamp: this.options.epochTimestamp
        });
    }

    checkExitCondition() {
        if (this.csvReplayer && this.options.replayLoop === false) {
            const allRowsConsumed = this.deviceList.every((d) => !this.csvReplayer.hasMoreRows(d));
            if (allRowsConsumed) {
                console.log(
                    `\n✅ Replayed all ${this.csvReplayer.getRowCount()} CSV row(s) successfully. Exiting.`
                );
                printCta();
                console.log();
                this.shutdownAndExit(0);
                return;
            }
        }

        if (!this.options.count) return;
        const allDone = this.deviceList.every(
            (d) => this.publishedCounts.get(d) >= this.options.count
        );
        if (allDone) {
            console.log(
                `\n✅ Published ${this.options.count} message(s) per device successfully. Exiting.`
            );
            printCta();
            console.log();
            this.shutdownAndExit(0);
        }
    }

    shutdownAndExit(code = 0) {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        this.activeIntervals.forEach((id) => clearInterval(id));
        this.activeIntervals.clear();

        this.clientManager.disconnectAll(() => {
            console.log('🔌 Disconnected all MQTT clients. Goodbye!');
            if (this.onExit) {
                this.onExit(code);
            } else {
                process.exit(code);
            }
        });
    }

    start() {
        const { options, deviceList } = this;
        const useIndependentSockets = options.independentClients || options.shadow;

        printCta();
        console.log();
        console.log(`🔌 Initializing MQTT simulation for ${deviceList.length} device(s)...`);
        console.log(
            `📋 Config: Schema v${this.effectiveSchemaVersion} | Preset: "${options.preset || options.type}" | Shadow: ${options.shadow ? 'ENABLED' : 'DISABLED'}`
        );
        if (useIndependentSockets) {
            console.log('⚡ Mode: Independent Client Sockets (1 TCP socket per device)');
        }
        if (options.willTopic) {
            console.log(
                `📜 LWT: Enabled (Topic: "${options.willTopic}" | QoS: ${options.willQos || 0} | Retain: ${Boolean(options.willRetain)})`
            );
        }
        if (this.csvReplayer) {
            console.log(
                `📁 Replay: Active ("${options.replay}" | ${this.csvReplayer.getRowCount()} rows | Loop: ${options.replayLoop !== false ? 'YES' : 'NO'})`
            );
        }
        if (options.chaosJitter)
            console.log(`⚡ Chaos: Jitter enabled (up to ${options.chaosJitter}ms)`);
        if (options.chaosDisconnect)
            console.log(`⚡ Chaos: Random ungraceful disconnect (${options.chaosDisconnect}%)`);

        process.on('SIGINT', () => {
            console.log('\n🛑 Gracefully shutting down...');
            printCta();
            console.log();
            this.shutdownAndExit(0);
        });

        if (useIndependentSockets) {
            deviceList.forEach((devId) => {
                const client = this.clientManager.connectClient(devId, false);

                client.on('connect', () => {
                    console.log(`✅ [${devId}] Connected to broker.`);

                    let currentIntervalMs = options.interval;
                    if (options.shadow) {
                        const shadow = new ShadowManager(
                            client,
                            options.orgId,
                            devId,
                            { interval: currentIntervalMs },
                            (delta) => {
                                if (
                                    delta.samplingInterval &&
                                    delta.samplingInterval !== currentIntervalMs
                                ) {
                                    console.log(
                                        `🔄 [Runtime:${devId}] Adjusting publishing interval to ${delta.samplingInterval}ms`
                                    );
                                    currentIntervalMs = delta.samplingInterval;
                                    this.restartDeviceLoop(devId, client, currentIntervalMs);
                                }
                            }
                        );
                        shadow.init();
                    }

                    this.startDeviceLoop(devId, client, currentIntervalMs);
                });

                client.on('error', (err) => {
                    console.error(`⚠️ [${devId}] Connection error:`, err.message);
                });
            });
        } else {
            const client = this.clientManager.connectClient(deviceList[0] || 'mock-device', true);

            client.on('connect', () => {
                console.log(`✅ Connected to broker! Simulating ${deviceList.length} device(s)...`);
                const intervalId = setInterval(async () => {
                    if (options.chaosDisconnect && Math.random() * 100 < options.chaosDisconnect) {
                        console.warn('💥 [Chaos] Simulating sudden unclean network drop!');
                        if (client.stream) client.stream.destroy();
                        return;
                    }

                    for (const devId of deviceList) {
                        const count = this.publishedCounts.get(devId);
                        if (options.count && count >= options.count) continue;

                        if (options.chaosJitter > 0) {
                            const delay = Math.floor(Math.random() * options.chaosJitter);
                            await new Promise((r) => setTimeout(r, delay));
                        }

                        const targetTopic = this.targetTopicTemplate
                            .replace(/\{deviceId\}/g, devId)
                            .replace(/\{orgId\}/g, options.orgId || '');

                        const message = this.buildPayload(devId);

                        client.publish(
                            targetTopic,
                            message,
                            { qos: options.qos, retain: options.retain },
                            (err) => {
                                if (err)
                                    console.error(`❌ [${devId}] Publish error: ${err.message}`);
                            }
                        );
                        console.log(`📤 [${devId}] -> ${message}`);

                        this.publishedCounts.set(devId, count + 1);
                    }
                    this.checkExitCondition();
                }, options.interval);

                this.activeIntervals.set('pool', intervalId);
            });

            client.on('error', (err) => {
                console.error('⚠️ Connection error:', err.message);
            });
        }
    }

    startDeviceLoop(devId, client, intervalMs) {
        const intervalId = setInterval(async () => {
            const count = this.publishedCounts.get(devId);
            if (this.options.count && count >= this.options.count) {
                clearInterval(intervalId);
                this.checkExitCondition();
                return;
            }

            if (
                this.options.chaosDisconnect &&
                Math.random() * 100 < this.options.chaosDisconnect
            ) {
                console.warn(`💥 [Chaos:${devId}] Simulating sudden unclean network drop!`);
                if (client.stream) client.stream.destroy();
                return;
            }

            if (this.options.chaosJitter > 0) {
                const delay = Math.floor(Math.random() * this.options.chaosJitter);
                await new Promise((r) => setTimeout(r, delay));
            }

            const targetTopic = this.targetTopicTemplate
                .replace(/\{deviceId\}/g, devId)
                .replace(/\{orgId\}/g, this.options.orgId || '');

            const message = this.buildPayload(devId);

            client.publish(
                targetTopic,
                message,
                { qos: this.options.qos, retain: this.options.retain },
                (err) => {
                    if (err) console.error(`❌ [${devId}] Publish error: ${err.message}`);
                }
            );
            console.log(`📤 [${devId}] -> ${message}`);

            this.publishedCounts.set(devId, count + 1);
            this.checkExitCondition();
        }, intervalMs);

        this.activeIntervals.set(devId, intervalId);
    }

    restartDeviceLoop(devId, client, newIntervalMs) {
        if (this.activeIntervals.has(devId)) {
            clearInterval(this.activeIntervals.get(devId));
        }
        this.startDeviceLoop(devId, client, newIntervalMs);
    }
}

module.exports = {
    SimulationRunner,
    printCta
};
