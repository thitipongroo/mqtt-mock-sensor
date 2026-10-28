// @ts-check
'use strict';

/**
 * Handles chaos network drop injection if configured.
 * @param {Record<string, any>} options
 * @param {any} client
 * @param {string} [label='']
 * @returns {boolean} True if dropped
 */
function handleChaosDisconnect(options, client, label = '') {
    if (options.chaosDisconnect && Math.random() * 100 < options.chaosDisconnect) {
        console.warn(
            `💥 [Chaos${label ? ':' + label : ''}] Simulating sudden unclean network drop!`
        );
        if (client.stream) client.stream.destroy();
        return true;
    }
    return false;
}

/**
 * Executes one publishing iteration for pooled multi-device client.
 * @param {any} runner - SimulationRunner instance
 * @param {any} client - Shared MQTT Client
 */
async function executePoolPublishCycle(runner, client) {
    if (runner.isShuttingDown) return;
    if (handleChaosDisconnect(runner.options, client)) return;

    /** @type {Array<any>} */
    const packets = [];
    for (const devId of runner.deviceList) {
        if (runner.isShuttingDown) return;
        const count = runner.publishedCounts.get(devId) || 0;
        if (runner.options.count && count >= runner.options.count) continue;

        if (runner.options.chaosJitter > 0) {
            const delay = Math.floor(Math.random() * runner.options.chaosJitter);
            await runner.waitDelay(delay);
        }

        if (runner.isShuttingDown) return;

        const targetTopic = runner.targetTopicTemplate
            .replace(/\{deviceId\}/g, devId)
            .replace(/\{orgId\}/g, runner.options.orgId || '');

        const message = runner.buildPayload(devId);

        packets.push({
            topic: targetTopic,
            message,
            options: { qos: runner.options.qos, retain: runner.options.retain },
            callback: (/** @type {Error|null} */ err) => {
                if (err) console.error(`❌ [${devId}] Publish error: ${err.message}`);
            }
        });
        console.log(`📤 [${devId}] -> ${message}`);

        runner.publishedCounts.set(devId, count + 1);
    }

    if (packets.length > 0) {
        runner.clientManager.publishBatch(client, packets);
    }
    runner.checkExitCondition();
}

/**
 * Executes one publishing iteration for an independent device client.
 * @param {any} runner - SimulationRunner instance
 * @param {any} client - Device MQTT Client
 * @param {string} devId - Device identifier
 */
async function executeDevicePublishCycle(runner, client, devId) {
    if (runner.isShuttingDown) return;

    const count = runner.publishedCounts.get(devId) || 0;
    if (runner.options.count && count >= runner.options.count) {
        runner.stopLoop(devId);
        runner.checkExitCondition();
        return;
    }

    if (handleChaosDisconnect(runner.options, client, devId)) return;

    if (runner.options.chaosJitter > 0) {
        const delay = Math.floor(Math.random() * runner.options.chaosJitter);
        await runner.waitDelay(delay);
    }

    if (runner.isShuttingDown) return;

    const targetTopic = runner.targetTopicTemplate
        .replace(/\{deviceId\}/g, devId)
        .replace(/\{orgId\}/g, runner.options.orgId || '');

    const message = runner.buildPayload(devId);

    client.publish(
        targetTopic,
        message,
        { qos: runner.options.qos, retain: runner.options.retain },
        (/** @type {Error|null} */ err) => {
            if (err) console.error(`❌ [${devId}] Publish error: ${err.message}`);
        }
    );
    console.log(`📤 [${devId}] -> ${message}`);

    runner.publishedCounts.set(devId, count + 1);
    runner.checkExitCondition();
}

module.exports = {
    executePoolPublishCycle,
    executeDevicePublishCycle
};
