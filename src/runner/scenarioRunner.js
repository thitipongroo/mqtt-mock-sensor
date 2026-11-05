// @ts-check
'use strict';

const EventEmitter = require('events');
const { DriftCompensatedPacer } = require('../scheduler/pacer');

const VALID_ANOMALY_TYPES = ['critical', 'warning', 'quality', 'out-of-bounds'];

/**
 * Normalizes anomaly rate to a 0-100 percentage.
 * Converts 0.0 - 1.0 fractional rates (e.g. 0.6 -> 60) while preserving 0-100 values.
 * @param {number|undefined|null} rate
 * @returns {number} Percentage (0-100)
 */
function normalizeAnomalyRate(rate) {
    if (typeof rate !== 'number' || isNaN(rate) || rate <= 0) return 0;
    if (rate <= 1.0) return Math.round(rate * 100);
    return Math.min(100, Math.round(rate));
}

/**
 * Infers domain anomaly type from phase status label or explicit type.
 * @param {string} [status]
 * @param {string} [explicitType]
 * @returns {string}
 */
function inferAnomalyType(status, explicitType) {
    if (explicitType && VALID_ANOMALY_TYPES.includes(explicitType.toLowerCase())) {
        return explicitType.toLowerCase();
    }
    if (!status || typeof status !== 'string') return 'critical';
    const s = status.toLowerCase();
    if (s.includes('spike') || s.includes('critical') || s.includes('overheat')) return 'critical';
    if (s.includes('warn')) return 'warning';
    if (s.includes('quality') || s.includes('degrade') || s.includes('uncertain')) return 'quality';
    if (s.includes('bound') || s.includes('invalid') || s.includes('overflow'))
        return 'out-of-bounds';
    return 'critical';
}

/**
 * Renders an ASCII progress bar string.
 * @param {number} current - Current elapsed progress
 * @param {number} total - Total target progress
 * @param {number} [barWidth=20] - Width of progress bar in characters
 * @returns {string} Formatted bar, e.g. "[██████████░░░░░░░░░░]  50%"
 */
function renderProgressBar(current, total, barWidth = 20) {
    const fraction = total > 0 ? Math.min(Math.max(current / total, 0), 1) : 0;
    const filledChars = Math.round(fraction * barWidth);
    const emptyChars = barWidth - filledChars;
    const filled = '█'.repeat(filledChars);
    const empty = '░'.repeat(emptyChars);
    const percent = Math.round(fraction * 100);
    return `[${filled}${empty}] ${String(percent).padStart(3, ' ')}%`;
}

/**
 * Formats a single scenario phase into a terminal indicator string.
 * @param {any} phase - Phase configuration object
 * @param {number} index - 0-based phase index
 * @param {number} totalPhases - Total number of phases
 * @returns {string}
 */
function renderPhaseIndicator(phase, index, totalPhases) {
    const num = index + 1;
    const status = phase.status || `PHASE_${num}`;
    const duration = `${phase.durationSec}s`;
    const interval = phase.intervalMs !== undefined ? `${phase.intervalMs}ms` : 'inherited';
    const anomaly =
        phase.anomalyRate !== undefined ? `${normalizeAnomalyRate(phase.anomalyRate)}%` : '0%';
    const blackout = phase.dropSockets ? ' | ⚡ Sockets: DROPPED' : '';
    return `📍 [Phase ${num}/${totalPhases}] ${status} | Duration: ${duration} | Interval: ${interval} | Anomaly: ${anomaly}${blackout}`;
}

/**
 * ScenarioRunner coordinates pre-scheduled timeline drills exported from Pulse SensorLab.
 * Dynamically adjusts intervalMs, anomalyRate, and socket connection state using DriftCompensatedPacer.
 */
class ScenarioRunner extends EventEmitter {
    /**
     * @param {any} scenario - Parsed scenario JSON object
     * @param {any} [runner] - Associated SimulationRunner instance
     * @param {Record<string, any>} [options={}] - Execution options
     */
    constructor(scenario, runner = null, options = {}) {
        super();
        this.scenario = scenario;
        this.runner = runner;
        this.options = options || {};

        this.phases = Array.isArray(scenario.phases) ? scenario.phases : [];
        this.totalDurationSec = this.phases.reduce(
            (acc, p) => acc + (Number(p.durationSec) || 0),
            0
        );

        this.currentPhaseIndex = 0;
        this.phaseElapsedSec = 0;
        this.totalElapsedSec = 0;
        this.isRunning = false;
        this.isFinished = false;

        /** @type {DriftCompensatedPacer|null} */
        this.timelinePacer = null;

        /** @type {number} */
        this.timeScale = Number(this.options.timeScale) || 1;
        this.tickIntervalMs = Math.max(10, Math.floor(1000 / this.timeScale));
    }

    /**
     * Retrieves the currently active phase.
     * @returns {any|null}
     */
    getCurrentPhase() {
        return this.phases[this.currentPhaseIndex] || null;
    }

    /**
     * Retrieves all scenario phases.
     * @returns {any[]}
     */
    getPhases() {
        return this.phases;
    }

    /**
     * Retrieves total duration of scenario in seconds.
     * @returns {number}
     */
    getTotalDuration() {
        return this.totalDurationSec;
    }

    /**
     * Starts the scenario timeline execution.
     */
    start() {
        if (this.isRunning || this.phases.length === 0) return;
        this.isRunning = true;
        this.isFinished = false;
        this.currentPhaseIndex = 0;
        this.phaseElapsedSec = 0;
        this.totalElapsedSec = 0;

        if (!this.options.silent) {
            console.log(
                `\n🎬 Starting Scenario: "${this.scenario.name}" (v${this.scenario.version})`
            );
            console.log(
                `📋 Phases: ${this.phases.length} | Total Duration: ${this.totalDurationSec}s`
            );
        }

        // Apply initial Phase (index 0)
        this.applyPhase(0);

        // Drive timeline ticks using DriftCompensatedPacer
        this.timelinePacer = new DriftCompensatedPacer(this.tickIntervalMs, () => this.tick());
        this.timelinePacer.start();
    }

    /**
     * Applies the configuration of the phase at the given index.
     * @param {number} index
     */
    applyPhase(index) {
        if (index < 0 || index >= this.phases.length) return;

        this.currentPhaseIndex = index;
        this.phaseElapsedSec = 0;
        const phase = this.phases[index];

        if (!this.options.silent) {
            console.log(`\n${renderPhaseIndicator(phase, index, this.phases.length)}`);
        }

        if (this.runner) {
            // 1. Adjust pacing interval if defined
            if (
                phase.intervalMs !== undefined &&
                typeof this.runner.updateInterval === 'function'
            ) {
                this.runner.updateInterval(phase.intervalMs);
            }

            // 2. Adjust anomaly rate & type if defined
            if (
                (phase.anomalyRate !== undefined || phase.anomalyType || phase.status) &&
                typeof this.runner.updateAnomaly === 'function'
            ) {
                const inferredType = inferAnomalyType(phase.status, phase.anomalyType);
                this.runner.updateAnomaly(phase.anomalyRate, inferredType);
            }

            // 3. Handle network blackout / dropSockets
            if (phase.dropSockets) {
                if (typeof this.runner.dropSockets === 'function') {
                    this.runner.dropSockets();
                }
            } else if (this.runner.socketsDropped) {
                if (typeof this.runner.reconnectSockets === 'function') {
                    this.runner.reconnectSockets();
                }
            }
        }

        this.emit('phaseChange', phase, index, this.phases.length);
    }

    /**
     * Evaluates one second of scenario timeline.
     */
    tick() {
        if (!this.isRunning || this.isFinished) return;

        this.phaseElapsedSec++;
        this.totalElapsedSec++;

        const currentPhase = this.getCurrentPhase();
        const percent =
            this.totalDurationSec > 0
                ? Math.min(100, Math.round((this.totalElapsedSec / this.totalDurationSec) * 100))
                : 100;
        const bar = renderProgressBar(this.totalElapsedSec, this.totalDurationSec, 20);

        if (!this.options.silent && currentPhase) {
            const status = currentPhase.status || `Phase ${this.currentPhaseIndex + 1}`;
            console.log(
                `⏱️  ${bar} (${this.totalElapsedSec}s/${this.totalDurationSec}s) | [${status}]`
            );
        }

        this.emit('progress', {
            percent,
            elapsedSec: this.totalElapsedSec,
            totalSec: this.totalDurationSec,
            phaseElapsedSec: this.phaseElapsedSec,
            currentPhase,
            phaseIndex: this.currentPhaseIndex
        });

        // Check if current phase duration has expired
        if (currentPhase && this.phaseElapsedSec >= currentPhase.durationSec) {
            const nextIndex = this.currentPhaseIndex + 1;
            if (nextIndex < this.phases.length) {
                this.applyPhase(nextIndex);
            } else {
                this.finish();
            }
        }
    }

    /**
     * Completes scenario execution and notifies runner to shut down.
     */
    finish() {
        if (this.isFinished) return;
        this.isFinished = true;
        this.isRunning = false;

        this.stop();

        if (!this.options.silent) {
            console.log(
                `\n🏁 Scenario "${this.scenario.name}" completed successfully! (${this.totalDurationSec}s total)\n`
            );
        }

        this.emit('finish');

        if (this.runner && typeof this.runner.shutdownAndExit === 'function') {
            this.runner.shutdownAndExit(0);
        }
    }

    /**
     * Halts timeline pacer and resets active state.
     */
    stop() {
        this.isRunning = false;
        if (this.timelinePacer) {
            this.timelinePacer.cancel();
            this.timelinePacer = null;
        }
    }
}

module.exports = {
    ScenarioRunner,
    renderProgressBar,
    renderPhaseIndicator,
    normalizeAnomalyRate,
    inferAnomalyType
};
