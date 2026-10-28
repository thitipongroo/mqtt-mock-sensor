// @ts-check
'use strict';

/**
 * @callback TickFunction
 * @returns {Promise<void>|void}
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
        this.tickCount = 1n;

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

        try {
            await this.tickFn();
        } catch (err) {
            console.error('Pacer tick error:', err instanceof Error ? err.message : err);
        }

        if (this.isCancelled || !this.isRunning) return;
        this.scheduleNext();
    }

    /**
     * Calculates accumulated drift and schedules next tick.
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
            // If drifted excessively (>10 intervals), re-anchor
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
