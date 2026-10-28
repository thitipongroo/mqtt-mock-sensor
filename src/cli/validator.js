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

module.exports = {
    UUID_REGEX,
    VALID_ANOMALY_TYPES,
    resolveSchemaVersion,
    validateCliOptions,
    loadTemplateFile
};
