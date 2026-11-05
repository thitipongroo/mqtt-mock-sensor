// @ts-check
'use strict';

const fs = require('fs');
const { validateBrokerUrl } = require('../clientManager');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ANOMALY_TYPES = ['critical', 'warning', 'quality', 'out-of-bounds'];

/**
 * Resolves the effective schema version based on options and preset.
 * @param {Record<string, any>} options
 * @returns {number}
 */
function resolveSchemaVersion(options) {
    if (options.schemaVersion) return options.schemaVersion;
    return 1;
}

/**
 * Validates CLI execution options. Throws or exits on critical errors.
 * @param {Record<string, any>} options
 * @returns {number} The resolved effectiveSchemaVersion
 */
function validateCliOptions(options) {
    try {
        validateBrokerUrl(options.broker, options.allowLocal);
    } catch (err) {
        console.error(`❌ Security Error: ${err.message}`);
        process.exit(1);
    }

    if (options.duration !== undefined && (isNaN(options.duration) || options.duration <= 0)) {
        console.error('❌ Error: --duration must be a positive integer in seconds');
        process.exit(1);
    }

    if (![0, 1, 2].includes(options.qos)) {
        console.error('❌ Error: QoS must be 0, 1, or 2');
        process.exit(1);
    }

    if (options.willTopic && ![0, 1, 2].includes(options.willQos)) {
        console.error('❌ Error: --will-qos must be 0, 1, or 2');
        process.exit(1);
    }

    if (options.anomalyType && !VALID_ANOMALY_TYPES.includes(options.anomalyType.toLowerCase())) {
        console.error(`❌ Error: Invalid --anomaly-type "${options.anomalyType}".`);
        process.exit(1);
    }

    const effectiveSchemaVersion = resolveSchemaVersion(options);
    if (![1, 2].includes(effectiveSchemaVersion)) {
        console.error('❌ Error: --schema-version must be 1 or 2');
        process.exit(1);
    }

    if (options.orgId && !UUID_REGEX.test(options.orgId)) {
        console.error(
            `❌ Error: Invalid --org-id format "${options.orgId}". Must be a valid UUID.`
        );
        process.exit(1);
    }

    return effectiveSchemaVersion;
}

/**
 * Loads a custom JSON template file if specified.
 * @param {string} [templatePath]
 * @returns {string|null}
 */
function loadTemplateFile(templatePath) {
    if (!templatePath) return null;
    try {
        return fs.readFileSync(templatePath, 'utf-8');
    } catch (err) {
        console.error(`❌ Failed to read template file: ${err.message}`);
        process.exit(1);
    }
}

/**
 * @typedef {Object} ScenarioPhase
 * @property {number} durationSec - Phase duration in seconds
 * @property {number} [intervalMs] - Message publish interval in ms
 * @property {number} [anomalyRate] - Anomaly rate (0.0 to 1.0 or 0 to 100)
 * @property {string} [anomalyType] - Anomaly type
 * @property {string} [status] - Phase status label
 * @property {boolean} [dropSockets] - Simulate socket drop / network blackout during phase
 */

/**
 * @typedef {Object} ScenarioConfig
 * @property {string} name - Scenario name
 * @property {number} version - Scenario schema version
 * @property {ScenarioPhase[]} phases - Sequential execution phases
 */

/**
 * Validates a scenario JSON object structure.
 * Throws an Error on validation failure.
 * @param {any} scenario
 * @returns {ScenarioConfig}
 */
function validateScenario(scenario) {
    if (!scenario || typeof scenario !== 'object') {
        throw new Error('Scenario must be a valid JSON object');
    }
    if (!scenario.name || typeof scenario.name !== 'string' || scenario.name.trim() === '') {
        throw new Error('Scenario "name" must be a non-empty string');
    }
    if (scenario.version === undefined || typeof scenario.version !== 'number') {
        throw new Error('Scenario "version" must be a number');
    }
    if (!Array.isArray(scenario.phases) || scenario.phases.length === 0) {
        throw new Error('Scenario "phases" must be a non-empty array');
    }

    for (let i = 0; i < scenario.phases.length; i++) {
        const phase = scenario.phases[i];
        if (!phase || typeof phase !== 'object') {
            throw new Error(`Scenario phase at index ${i} must be an object`);
        }
        if (
            typeof phase.durationSec !== 'number' ||
            isNaN(phase.durationSec) ||
            phase.durationSec <= 0
        ) {
            throw new Error(`Scenario phase ${i + 1}: "durationSec" must be a positive number`);
        }
        if (
            phase.intervalMs !== undefined &&
            (typeof phase.intervalMs !== 'number' ||
                isNaN(phase.intervalMs) ||
                phase.intervalMs <= 0)
        ) {
            throw new Error(`Scenario phase ${i + 1}: "intervalMs" must be a positive number`);
        }
        if (
            phase.anomalyRate !== undefined &&
            (typeof phase.anomalyRate !== 'number' ||
                isNaN(phase.anomalyRate) ||
                phase.anomalyRate < 0)
        ) {
            throw new Error(`Scenario phase ${i + 1}: "anomalyRate" must be a non-negative number`);
        }
        if (
            phase.anomalyType !== undefined &&
            !VALID_ANOMALY_TYPES.includes(String(phase.anomalyType).toLowerCase())
        ) {
            throw new Error(
                `Scenario phase ${i + 1}: Invalid "anomalyType" "${phase.anomalyType}". Allowed: ${VALID_ANOMALY_TYPES.join(', ')}`
            );
        }
    }

    return scenario;
}

/**
 * Loads and validates a scenario JSON file.
 * @param {string} [scenarioPath]
 * @param {{ exitOnError?: boolean }} [options]
 * @returns {ScenarioConfig|null}
 */
function loadScenarioFile(scenarioPath, { exitOnError = true } = {}) {
    if (!scenarioPath) return null;
    let content;
    try {
        content = fs.readFileSync(scenarioPath, 'utf-8');
    } catch (err) {
        if (exitOnError) {
            console.error(`❌ Failed to read scenario file: ${err.message}`);
            process.exit(1);
        }
        throw new Error(`Failed to read scenario file: ${err.message}`, { cause: err });
    }

    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (err) {
        if (exitOnError) {
            console.error(`❌ Invalid JSON in scenario file: ${err.message}`);
            process.exit(1);
        }
        throw new Error(`Invalid JSON in scenario file: ${err.message}`, { cause: err });
    }

    try {
        return validateScenario(parsed);
    } catch (err) {
        if (exitOnError) {
            console.error(`❌ Scenario validation error: ${err.message}`);
            process.exit(1);
        }
        throw err;
    }
}

module.exports = {
    UUID_REGEX,
    VALID_ANOMALY_TYPES,
    resolveSchemaVersion,
    validateCliOptions,
    loadTemplateFile,
    validateScenario,
    loadScenarioFile
};
