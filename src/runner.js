const { generatePayload } = require('./payloadGenerator');
const { ShadowManager } = require('./shadowManager');
const { validateBrokerUrl } = require('./clientManager');

function printCta() {
    console.log('\n┌────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 🚀 Elevate Your Fleet with Pulse SensorLab (Visual Web Studio)        │');
    console.log('│    Visual Telemetry Designer • Dynamic Chaos Injections • 100k Sockets │');
    console.log('│    👉 Free Visual Web Studio: https://sensorlab.pulseiot-cloud.com     │');
    console.log('│    ⭐ Star & Sponsor on GitHub: github.com/thitipongroo/mqtt-mock-sensor │');
    console.log('└────────────────────────────────────────────────────────────────────────┘\n');
}

/**
 * Pre-generated Payload Ring Buffer to eliminate V8 GC pauses and JSON serialization overhead
 * during high-frequency telemetry streaming (10 - 100 Hz).
 */
class PreGeneratedPayloadBuffer {
    constructor({ deviceList, type, options, customTemplate, csvReplayer, poolSize = 32 }) {
        this.deviceList = deviceList || [];
        this.type = type;
        this.options = options || {};
        this.customTemplate = customTemplate;
        this.csvReplayer = csvReplayer;
        this.poolSize = poolSize;
        this.buffers = new Map();

        if (!this.csvReplayer) {
            this.initPools();
        }
    }

    initPools() {
        for (const devId of this.deviceList) {
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
                    pool.push({ raw, fallback: true });
                }
            }
            this.buffers.set(devId, { pool, cursor: 0 });
        }
    }

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
        if (item.fallback) return item.raw;

        const ts = item.isEpoch ? Date.now() : `"${new Date().toISOString()}"`;
        return item.prefix + ts + item.suffix;
    }
}

class SimulationRunner {
    constructor({
        options = {},
        deviceList,
        targetTopicTemplate,
        effectiveSchemaVersion,
        customTemplate = null,
        csvReplayer = null,
        clientManager,
        onExit = null
    }) {
        if (options && options.broker) {
            validateBrokerUrl(options.broker, options.allowLocal);
        }

        this.options = options;
        this.deviceList = deviceList || [];
        this.targetTopicTemplate = targetTopicTemplate;
        this.effectiveSchemaVersion = effectiveSchemaVersion;
        this.customTemplate = customTemplate;
        this.csvReplayer = csvReplayer;
        this.clientManager = clientManager;
        this.onExit = onExit;

        this.activeIntervals = new Map();
        this.activeTimeouts = new Set();
        this.publishedCounts = new Map();
        this.deviceList.forEach((d) => this.publishedCounts.set(d, 0));
        this.isShuttingDown = false;

        this.sigintListener = null;
        this.sigtermListener = null;

        // Initialize high-throughput pre-generated payload buffer
        this.payloadBuffer = new PreGeneratedPayloadBuffer({
            deviceList: this.deviceList,
            type: this.options.type,
            options: {
                preset: this.options.preset,
                anomalyRate: this.options.anomalyRate,
                anomalyType: this.options.anomalyType,
                schemaVersion: this.effectiveSchemaVersion,
                orgId: this.options.orgId,
                epochTimestamp: this.options.epochTimestamp
            },
            customTemplate: this.customTemplate,
            csvReplayer: this.csvReplayer
        });
    }

    waitDelay(ms) {
        if (ms <= 0) return Promise.resolve();
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                this.activeTimeouts.delete(timeoutId);
                resolve();
            }, ms);
            this.activeTimeouts.add(timeoutId);
        });
    }

    buildPayload(devId) {
        if (this.payloadBuffer) {
            return this.payloadBuffer.getPayload(devId);
        }
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

    /**
     * Self-Adjusting Drift-Compensated Scheduler using process.hrtime.bigint().
     * Eliminates accumulated timer lag and keeps pacing variance strictly under 2ms.
     */
    runCompensatedLoop(key, intervalMs, tickFn) {
        const intervalNs = BigInt(intervalMs) * 1000000n;
        const t0 = process.hrtime.bigint();
        let tickCount = 1n;

        const timerRef = {
            timeoutId: null,
            immediateId: null,
            cancelled: false,
            cancel() {
                this.cancelled = true;
                if (this.timeoutId) {
                    clearTimeout(this.timeoutId);
                    this.timeoutId = null;
                }
                if (this.immediateId) {
                    clearImmediate(this.immediateId);
                    this.immediateId = null;
                }
            }
        };

        const scheduleNext = () => {
            if (this.isShuttingDown || timerRef.cancelled) return;

            tickCount += 1n;
            const targetNs = t0 + tickCount * intervalNs;
            const nowNs = process.hrtime.bigint();
            const diffNs = targetNs - nowNs;
            const diffMs = Number(diffNs) / 1000000;

            if (diffMs > 2) {
                timerRef.timeoutId = setTimeout(
                    () => {
                        this.activeTimeouts.delete(timerRef.timeoutId);
                        timerRef.timeoutId = null;
                        runTick();
                    },
                    Math.floor(diffMs - 1)
                );
                this.activeTimeouts.add(timerRef.timeoutId);
            } else if (diffMs > 0) {
                timerRef.immediateId = setImmediate(() => {
                    timerRef.immediateId = null;
                    runTick();
                });
            } else {
                // Catch-up when lagged behind target
                if (nowNs - targetNs > intervalNs * 10n) {
                    // Re-anchor if lagged excessively (>10 intervals)
                    tickCount = 1n;
                }
                timerRef.immediateId = setImmediate(() => {
                    timerRef.immediateId = null;
                    runTick();
                });
            }
        };

        const runTick = async () => {
            if (this.isShuttingDown || timerRef.cancelled) return;
            try {
                await tickFn();
            } catch (err) {
                console.error('Tick execution error:', err.message);
            }
            if (this.isShuttingDown || timerRef.cancelled) return;
            scheduleNext();
        };

        // Initial tick scheduled after intervalMs
        timerRef.timeoutId = setTimeout(() => {
            this.activeTimeouts.delete(timerRef.timeoutId);
            timerRef.timeoutId = null;
            runTick();
        }, intervalMs);
        this.activeTimeouts.add(timerRef.timeoutId);

        this.activeIntervals.set(key, timerRef);
        return timerRef;
    }

    stopLoop(key) {
        const timer = this.activeIntervals.get(key);
        if (timer) {
            if (typeof timer.cancel === 'function') {
                timer.cancel();
            } else {
                clearInterval(timer);
                clearTimeout(timer);
            }
            this.activeIntervals.delete(key);
        }
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

        // Clean up process signal listeners
        if (this.sigintListener) {
            process.removeListener('SIGINT', this.sigintListener);
            this.sigintListener = null;
        }
        if (this.sigtermListener) {
            process.removeListener('SIGTERM', this.sigtermListener);
            this.sigtermListener = null;
        }

        // Clear all active interval timers
        this.activeIntervals.forEach((timer) => {
            if (timer && typeof timer.cancel === 'function') {
                timer.cancel();
            } else {
                clearInterval(timer);
                clearTimeout(timer);
            }
        });
        this.activeIntervals.clear();

        // Clear all active timeout timers
        this.activeTimeouts.forEach((id) => clearTimeout(id));
        this.activeTimeouts.clear();

        if (this.clientManager && typeof this.clientManager.disconnectAll === 'function') {
            this.clientManager.disconnectAll(() => {
                console.log('🔌 Disconnected all MQTT clients. Goodbye!');
                if (this.onExit) {
                    this.onExit(code);
                } else {
                    process.exit(code);
                }
            });
        } else {
            if (this.onExit) {
                this.onExit(code);
            } else {
                process.exit(code);
            }
        }
    }

    stop() {
        return new Promise((resolve) => {
            this.onExit = resolve;
            this.shutdownAndExit(0);
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

        // Duration limit handling
        if (options.duration && options.duration > 0) {
            const durationMs = options.duration * 1000;
            console.log(`⏱️ Duration limit: ${options.duration}s`);
            const durationTimer = setTimeout(() => {
                console.log(`\n⏱️ Duration limit of ${options.duration}s reached. Exiting.`);
                printCta();
                console.log();
                this.shutdownAndExit(0);
            }, durationMs);
            if (durationTimer.unref) durationTimer.unref();
            this.activeTimeouts.add(durationTimer);
        }

        const handleSignal = (sig) => {
            console.log(`\n🛑 Received ${sig}. Gracefully shutting down...`);
            printCta();
            console.log();
            this.shutdownAndExit(0);
        };

        this.sigintListener = () => handleSignal('SIGINT');
        this.sigtermListener = () => handleSignal('SIGTERM');

        process.on('SIGINT', this.sigintListener);
        process.on('SIGTERM', this.sigtermListener);

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

                this.runCompensatedLoop('pool', options.interval, async () => {
                    if (this.isShuttingDown) return;

                    if (options.chaosDisconnect && Math.random() * 100 < options.chaosDisconnect) {
                        console.warn('💥 [Chaos] Simulating sudden unclean network drop!');
                        if (client.stream) client.stream.destroy();
                        return;
                    }

                    const packets = [];
                    for (const devId of deviceList) {
                        if (this.isShuttingDown) return;
                        const count = this.publishedCounts.get(devId);
                        if (options.count && count >= options.count) continue;

                        if (options.chaosJitter > 0) {
                            const delay = Math.floor(Math.random() * options.chaosJitter);
                            await this.waitDelay(delay);
                        }

                        if (this.isShuttingDown) return;

                        const targetTopic = this.targetTopicTemplate
                            .replace(/\{deviceId\}/g, devId)
                            .replace(/\{orgId\}/g, options.orgId || '');

                        const message = this.buildPayload(devId);

                        packets.push({
                            topic: targetTopic,
                            message,
                            options: { qos: options.qos, retain: options.retain },
                            callback: (err) => {
                                if (err)
                                    console.error(`❌ [${devId}] Publish error: ${err.message}`);
                            }
                        });
                        console.log(`📤 [${devId}] -> ${message}`);

                        this.publishedCounts.set(devId, count + 1);
                    }

                    if (packets.length > 0) {
                        this.clientManager.publishBatch(client, packets);
                    }
                    this.checkExitCondition();
                });
            });

            client.on('error', (err) => {
                console.error('⚠️ Connection error:', err.message);
            });
        }
    }

    startDeviceLoop(devId, client, intervalMs) {
        this.runCompensatedLoop(devId, intervalMs, async () => {
            if (this.isShuttingDown) return;

            const count = this.publishedCounts.get(devId);
            if (this.options.count && count >= this.options.count) {
                this.stopLoop(devId);
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
                await this.waitDelay(delay);
            }

            if (this.isShuttingDown) return;

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
        });
    }

    restartDeviceLoop(devId, client, newIntervalMs) {
        this.stopLoop(devId);
        this.startDeviceLoop(devId, client, newIntervalMs);
    }
}

module.exports = {
    SimulationRunner,
    PreGeneratedPayloadBuffer,
    printCta
};
