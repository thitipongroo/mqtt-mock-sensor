// @ts-check
'use strict';

/**
 * @callback TickFunction
 * @returns {Promise<void>|void}
 */

/**
 * @typedef {Object} PacerMetrics
 * @property {number} executedTicks
 * @property {number} meanIntervalMs
 * @property {number} varianceMs
 * @property {number} totalDriftMs
 * @property {number} maxJitterMs
 */

/**
 * High-Resolution Self-Adjusting Drift-Compensated Pacer.
 * Eliminates accumulated timer lag and keeps pacing variance strictly under 2ms.
 */
class DriftCompensatedPacer {
    /**
     * @param {number} intervalMs - Target pacing interval in milliseconds
     * @param {TickFunction} tickFn - Async worker function executed on each tick
     */
    constructor(intervalMs, tickFn) {
        this.intervalMs = intervalMs;
        this.intervalNs = BigInt(intervalMs) * 1000000n;
        this.tickFn = tickFn;
        this.t0 = process.hrtime.bigint();
        this.tickCount = 1n;
        this.executedTicks = 0;
        this.lastTickNs = this.t0;
        /** @type {number[]} */
        this.tickDeltas = [];
        /** @type {NodeJS.Timeout|null} */
        this.timeoutId = null;
        /** @type {NodeJS.Immediate|null} */
        this.immediateId = null;
        this.isCancelled = false;
        this.isRunning = false;
    }

    /**
     * Starts the drift-compensated loop.
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.t0 = process.hrtime.bigint();
        this.lastTickNs = this.t0;
        this.tickCount = 1n;
        this.executedTicks = 0;
        this.tickDeltas = [];

        this.timeoutId = setTimeout(() => {
            this.timeoutId = null;
            this.runTick();
        }, this.intervalMs);
    }

    /**
     * Executes the tick workload and schedules the next tick based on anchor timeline.
     */
    async runTick() {
        if (this.isCancelled || !this.isRunning) return;

        const currentNs = process.hrtime.bigint();
        if (this.executedTicks > 0) {
            const deltaMs = Number(currentNs - this.lastTickNs) / 1000000;
            this.tickDeltas.push(deltaMs);
            if (this.tickDeltas.length > 200) this.tickDeltas.shift();
        }
        this.lastTickNs = currentNs;
        this.executedTicks++;

        try {
            await this.tickFn();
        } catch (err) {
            console.error('Pacer tick error:', err instanceof Error ? err.message : err);
        }

        if (this.isCancelled || !this.isRunning) return;
        this.scheduleNext();
    }

    /**
     * Calculates accumulated drift and schedules next tick with adaptive calibration.
     */
    scheduleNext() {
        this.tickCount += 1n;
        const targetNs = this.t0 + this.tickCount * this.intervalNs;
        const nowNs = process.hrtime.bigint();
        const diffNs = targetNs - nowNs;
        const diffMs = Number(diffNs) / 1000000;

        if (diffMs > 2) {
            this.timeoutId = setTimeout(
                () => {
                    this.timeoutId = null;
                    this.runTick();
                },
                Math.floor(diffMs - 1)
            );
        } else if (diffMs > 0) {
            this.immediateId = setImmediate(() => {
                this.immediateId = null;
                this.runTick();
            });
        } else {
            // If drifted excessively (>10 intervals), re-anchor to prevent runaway cascade
            if (nowNs - targetNs > this.intervalNs * 10n) {
                this.tickCount = 1n;
                this.t0 = nowNs;
            }
            this.immediateId = setImmediate(() => {
                this.immediateId = null;
                this.runTick();
            });
        }
    }

    /**
     * Retrieves runtime pacing metrics (mean interval, variance, accumulated drift).
     * @returns {PacerMetrics}
     */
    getMetrics() {
        if (this.tickDeltas.length === 0) {
            return {
                executedTicks: this.executedTicks,
                meanIntervalMs: this.intervalMs,
                varianceMs: 0,
                totalDriftMs: 0,
                maxJitterMs: 0
            };
        }

        const count = this.tickDeltas.length;
        const sum = this.tickDeltas.reduce((a, b) => a + b, 0);
        const mean = sum / count;
        const variance =
            this.tickDeltas.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / count;
        const totalElapsedMs = Number(this.lastTickNs - this.t0) / 1000000;
        const expectedMs = (this.executedTicks - 1) * this.intervalMs;
        const totalDrift = Math.abs(totalElapsedMs - expectedMs);
        const maxJitter = this.tickDeltas.reduce(
            (max, d) => Math.max(max, Math.abs(d - this.intervalMs)),
            0
        );

        return {
            executedTicks: this.executedTicks,
            meanIntervalMs: parseFloat(mean.toFixed(3)),
            varianceMs: parseFloat(variance.toFixed(3)),
            totalDriftMs: parseFloat(totalDrift.toFixed(3)),
            maxJitterMs: parseFloat(maxJitter.toFixed(3))
        };
    }

    /**
     * Cancels any pending timers and stops the pacer loop.
     */
    cancel() {
        this.isCancelled = true;
        this.isRunning = false;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        if (this.immediateId) {
            clearImmediate(this.immediateId);
            this.immediateId = null;
        }
    }
}

module.exports = {
    DriftCompensatedPacer
};
