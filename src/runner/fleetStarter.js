// @ts-check
'use strict';

const { ShadowManager } = require('../shadowManager');
const { executePoolPublishCycle } = require('./publishLoop');

/**
 * Initializes and connects independent client sockets per device.
 * @param {any} runner
 */
function startIndependentFleet(runner) {
    runner.deviceList.forEach((/** @type {string} */ devId) => {
        const client = runner.clientManager.connectClient(devId, false);
        client.on('connect', () => {
            console.log(`✅ [${devId}] Connected to broker.`);
            let currentIntervalMs = runner.options.interval;
            if (runner.options.shadow) {
                const shadow = new ShadowManager(
                    client,
                    runner.options.orgId,
                    devId,
                    { interval: currentIntervalMs },
                    (/** @type {any} */ delta) => {
                        const nextInterval = delta.samplingInterval;
                        if (nextInterval && nextInterval !== currentIntervalMs) {
                            console.log(
                                `🔄 [Runtime:${devId}] Adjusting interval to ${nextInterval}ms`
                            );
                            currentIntervalMs = nextInterval;
                            runner.restartDeviceLoop(devId, client, currentIntervalMs);
                        }
                    }
                );
                shadow.init();
            }
            runner.startDeviceLoop(devId, client, currentIntervalMs);
        });
        client.on('error', (/** @type {Error} */ err) => {
            console.error(`⚠️ [${devId}] Connection error:`, err.message);
        });
    });
}

/**
 * Initializes and connects a shared client socket simulating the device pool.
 * @param {any} runner
 */
function startPooledSimulation(runner) {
    const client = runner.clientManager.connectClient(runner.deviceList[0] || 'mock-device', true);
    client.on('connect', () => {
        console.log(`✅ Connected to broker! Simulating ${runner.deviceList.length} device(s)...`);
        runner.runCompensatedLoop('pool', runner.options.interval, () =>
            executePoolPublishCycle(runner, client)
        );
    });
    client.on('error', (/** @type {Error} */ err) => {
        console.error('⚠️ Connection error:', err.message);
    });
}

/**
 * Sets up a duration timeout if specified in runner options.
 * @param {any} runner
 */
function setupDurationTimer(runner) {
    if (!runner.options.duration || runner.options.duration <= 0) return;
    console.log(`⏱️ Duration limit: ${runner.options.duration}s`);
    const durationTimer = setTimeout(() => {
        console.log(`\n⏱️ Duration limit of ${runner.options.duration}s reached. Exiting.\n`);
        runner.shutdownAndExit(0);
    }, runner.options.duration * 1000);
    if (durationTimer.unref) durationTimer.unref();
    runner.activeTimeouts.add(durationTimer);
}

module.exports = {
    startIndependentFleet,
    startPooledSimulation,
    setupDurationTimer
};
