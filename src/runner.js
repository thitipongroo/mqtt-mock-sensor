// @ts-check
'use strict';

const { generatePayload } = require('./payloadGenerator');
const { validateBrokerUrl } = require('./clientManager');
const { DriftCompensatedPacer } = require('./scheduler/pacer');
const { PreGeneratedPayloadBuffer } = require('./scheduler/payloadBuffer');
const { printCta, printInitBanner } = require('./ui/banner');
const { executeDevicePublishCycle, executePoolPublishCycle } = require('./runner/publishLoop');
const {
    startIndependentFleet,
    startPooledSimulation,
    setupDurationTimer
} = require('./runner/fleetStarter');
const { performGracefulShutdown, registerSignalHandlers } = require('./runner/shutdownHelper');
const { checkExitCondition } = require('./runner/exitChecker');
const { ScenarioRunner } = require('./runner/scenarioRunner');

/** @typedef {import('../types').RunnerConfig} RunnerConfig */

class SimulationRunner {
    /** @param {RunnerConfig} [config={}] */
    constructor({
        options = {},
        deviceList = [],
        targetTopicTemplate = 'sensor/mock/data',
        effectiveSchemaVersion = 1,
        customTemplate = null,
        csvReplayer = null,
        clientManager,
        onExit = null,
        scenario = null
    } = {}) {
        if (options && options.broker) validateBrokerUrl(options.broker, options.allowLocal);

        this.options = options;
        this.deviceList = deviceList || [];
        this.targetTopicTemplate = targetTopicTemplate;
        this.effectiveSchemaVersion = effectiveSchemaVersion;
        this.customTemplate = customTemplate;
        this.csvReplayer = csvReplayer;
        this.clientManager = clientManager;
        this.onExit = onExit;
        this.scenario = scenario;
        /** @type {ScenarioRunner|null} */
        this.scenarioRunner = null;
        this.socketsDropped = false;

        /** @type {Map<string, DriftCompensatedPacer>} */
        this.activeIntervals = new Map();
        /** @type {Set<NodeJS.Timeout>} */
        this.activeTimeouts = new Set();
        /** @type {Set<Function>} */
        this.activeWaiters = new Set();
        /** @type {Map<string, number>} */
        this.publishedCounts = new Map();
        this.deviceList.forEach((d) => this.publishedCounts.set(d, 0));
        this.isShuttingDown = false;
        /** @type {Function|null} */
        this.sigintListener = null;
        this.sigtermListener = null;

        this.payloadBuffer = new PreGeneratedPayloadBuffer({
            deviceList: this.deviceList,
            type: this.options.type,
            options: { ...this.options, schemaVersion: effectiveSchemaVersion },
            customTemplate: this.customTemplate,
            csvReplayer: this.csvReplayer
        });
    }

    /** @param {number} ms @returns {Promise<void>} */
    waitDelay(ms) {
        if (this.isShuttingDown || ms <= 0) return Promise.resolve();
        return new Promise((resolve) => {
            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                this.activeTimeouts.delete(timeoutId);
                this.activeWaiters.delete(cleanup);
                resolve();
            };
            const timeoutId = setTimeout(cleanup, ms);
            this.activeTimeouts.add(timeoutId);
            this.activeWaiters.add(cleanup);
        });
    }

    /** @param {string} devId @returns {string} */
    buildPayload(devId) {
        if (this.payloadBuffer) return this.payloadBuffer.getPayload(devId);
        const row = this.csvReplayer && this.csvReplayer.getNextPayload(devId);
        return (
            row ||
            generatePayload(this.options.type, {
                deviceId: devId,
                template: this.customTemplate,
                schemaVersion: this.effectiveSchemaVersion,
                ...this.options
            })
        );
    }

    /**
     * @param {string} key
     * @param {number} intervalMs
     * @param {() => Promise<void>|void} tickFn
     * @returns {DriftCompensatedPacer}
     */
    runCompensatedLoop(key, intervalMs, tickFn) {
        const pacer = new DriftCompensatedPacer(intervalMs, tickFn);
        this.activeIntervals.set(key, pacer);
        pacer.start();
        return pacer;
    }

    /** @param {string} key */
    stopLoop(key) {
        const pacer = this.activeIntervals.get(key);
        if (pacer) {
            if (typeof pacer.cancel === 'function') pacer.cancel();
            else clearInterval(/** @type {any} */ (pacer));
            this.activeIntervals.delete(key);
        }
    }

    checkExitCondition() {
        checkExitCondition(this);
    }

    /** @param {number} [code=0] */
    shutdownAndExit(code = 0) {
        performGracefulShutdown(this, code);
    }

    /** @returns {Promise<void>} */
    stop() {
        return new Promise((resolve) => {
            this.onExit = resolve;
            this.shutdownAndExit(0);
        });
    }

    start() {
        const { options, deviceList } = this;
        const isIndependent = Boolean(options.independentClients || options.shadow);

        printInitBanner({
            deviceCount: deviceList.length,
            schemaVersion: this.effectiveSchemaVersion,
            presetOrType: options.preset || options.type,
            isShadow: Boolean(options.shadow),
            isIndependent,
            options,
            csvReplayer: this.csvReplayer
        });

        setupDurationTimer(this);
        registerSignalHandlers(this);

        if (isIndependent) this.startIndependentFleet();
        else this.startPooledSimulation();

        if (this.scenario) {
            this.scenarioRunner = new ScenarioRunner(this.scenario, this, this.options);
            this.scenarioRunner.start();
        }
    }

    startIndependentFleet() {
        startIndependentFleet(this);
    }

    startPooledSimulation() {
        startPooledSimulation(this);
    }

    /**
     * Dynamically updates the pacing interval and restarts active drift-compensated loops.
     * @param {number} newIntervalMs
     */
    updateInterval(newIntervalMs) {
        this.options.interval = newIntervalMs;
        if (this.activeIntervals.has('pool')) {
            const client = this.clientManager.activeClients[0];
            if (client) {
                this.stopLoop('pool');
                this.runCompensatedLoop('pool', newIntervalMs, () =>
                    executePoolPublishCycle(this, client)
                );
            }
        }
        for (let i = 0; i < this.deviceList.length; i++) {
            const devId = this.deviceList[i];
            if (this.activeIntervals.has(devId)) {
                const client =
                    this.clientManager.activeClients[i] || this.clientManager.activeClients[0];
                if (client) {
                    this.restartDeviceLoop(devId, client, newIntervalMs);
                }
            }
        }
    }

    /**
     * Dynamically updates anomaly injection parameters and flushes pre-generated payload pools.
     * @param {number} [rate]
     * @param {string} [type]
     */
    updateAnomaly(rate, type) {
        if (rate !== undefined && rate !== null) {
            const percentage = rate <= 1.0 && rate > 0 ? Math.round(rate * 100) : Math.round(rate);
            this.options.anomalyRate = percentage;
        }
        if (type) {
            this.options.anomalyType = type;
        }
        if (this.payloadBuffer) {
            this.payloadBuffer.options = {
                ...this.options,
                schemaVersion: this.effectiveSchemaVersion
            };
            if (typeof this.payloadBuffer.initPools === 'function') {
                this.payloadBuffer.initPools();
            }
        }
    }

    /**
     * Cuts client broker connections to simulate a network blackout.
     */
    dropSockets() {
        console.warn('⚡ [Scenario] Sockets dropped: network blackout simulated.');
        this.socketsDropped = true;
        this.activeIntervals.forEach((pacer) => {
            if (pacer && typeof pacer.cancel === 'function') pacer.cancel();
        });
        this.activeIntervals.clear();

        if (this.clientManager && Array.isArray(this.clientManager.activeClients)) {
            this.clientManager.activeClients.forEach((client) => {
                try {
                    if (client.stream && typeof client.stream.destroy === 'function') {
                        client.stream.destroy();
                    } else if (typeof client.end === 'function') {
                        client.end(true);
                    }
                } catch {
                    // Ignore force drop errors
                }
            });
        }
    }

    /**
     * Reconnects client sockets when network blackout ends.
     */
    reconnectSockets() {
        if (!this.socketsDropped) return;
        console.log('🔄 [Scenario] Network restored! Reconnecting client sockets...');
        this.socketsDropped = false;
        if (this.clientManager) {
            const isIndependent = Boolean(this.options.independentClients || this.options.shadow);
            this.clientManager.activeClients = [];
            if (isIndependent) {
                this.startIndependentFleet();
            } else {
                this.startPooledSimulation();
            }
        }
    }

    /**
     * @param {string} devId
     * @param {any} client
     * @param {number} intervalMs
     */
    startDeviceLoop(devId, client, intervalMs) {
        this.runCompensatedLoop(devId, intervalMs, () =>
            executeDevicePublishCycle(this, client, devId)
        );
    }

    /**
     * @param {string} devId
     * @param {any} client
     * @param {number} newIntervalMs
     */
    restartDeviceLoop(devId, client, newIntervalMs) {
        this.stopLoop(devId);
        this.startDeviceLoop(devId, client, newIntervalMs);
    }
}

module.exports = {
    SimulationRunner,
    PreGeneratedPayloadBuffer,
    DriftCompensatedPacer,
    ScenarioRunner,
    printCta
};
