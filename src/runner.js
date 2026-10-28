// @ts-check
'use strict';

const { generatePayload } = require('./payloadGenerator');
const { validateBrokerUrl } = require('./clientManager');
const { DriftCompensatedPacer } = require('./scheduler/pacer');
const { PreGeneratedPayloadBuffer } = require('./scheduler/payloadBuffer');
const { printCta, printInitBanner } = require('./ui/banner');
const { executeDevicePublishCycle } = require('./runner/publishLoop');
const {
    startIndependentFleet,
    startPooledSimulation,
    setupDurationTimer
} = require('./runner/fleetStarter');
const { performGracefulShutdown, registerSignalHandlers } = require('./runner/shutdownHelper');
const { checkExitCondition } = require('./runner/exitChecker');

/**
 * @typedef {Object} RunnerConfig
 * @property {Record<string, any>} [options]
 * @property {string[]} [deviceList]
 * @property {string} [targetTopicTemplate]
 * @property {number} [effectiveSchemaVersion]
 * @property {string|null} [customTemplate]
 * @property {any} [csvReplayer]
 * @property {any} [clientManager]
 * @property {Function|null} [onExit]
 */

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
        onExit = null
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

        /** @type {Map<string, DriftCompensatedPacer>} */
        this.activeIntervals = new Map();
        /** @type {Set<NodeJS.Timeout>} */
        this.activeTimeouts = new Set();
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
        if (ms <= 0) return Promise.resolve();
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                this.activeTimeouts.delete(timeoutId);
                resolve();
            }, ms);
            this.activeTimeouts.add(timeoutId);
        });
    }

    /** @param {string} devId @returns {string} */
    buildPayload(devId) {
        if (this.payloadBuffer) return this.payloadBuffer.getPayload(devId);
        if (this.csvReplayer) {
            const row = this.csvReplayer.getNextPayload(devId);
            if (row) return row;
        }
        return generatePayload(this.options.type, {
            deviceId: devId,
            template: this.customTemplate,
            schemaVersion: this.effectiveSchemaVersion,
            ...this.options
        });
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
    }

    startIndependentFleet() {
        startIndependentFleet(this);
    }
    startPooledSimulation() {
        startPooledSimulation(this);
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
    printCta
};
