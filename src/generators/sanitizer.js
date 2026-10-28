// @ts-check
'use strict';

/**
 * Set of forbidden keys that can lead to object prototype pollution.
 * @type {ReadonlySet<string>}
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Checks whether a property key is dangerous (could cause prototype pollution).
 * @param {*} key - Property name to inspect
 * @returns {boolean} True if key is dangerous
 */
function isDangerousKey(key) {
    if (typeof key !== 'string') return false;
    const lower = key.trim().toLowerCase();
    return (
        DANGEROUS_KEYS.has(lower) ||
        lower.includes('__proto__') ||
        lower.includes('prototype') ||
        lower.includes('constructor')
    );
}

/**
 * Recursively sanitizes an object by removing prototype-polluting properties
 * and rebuilding mappings using prototype-less objects (Object.create(null)).
 * @template T
 * @param {T} input - Object or value to sanitize
 * @returns {T} Sanitized prototype-less object or original primitive value
 */
function sanitizeObject(input) {
    if (input === null || typeof input !== 'object') {
        return input;
    }

    if (Array.isArray(input)) {
        // @ts-ignore
        return input.map((item) => sanitizeObject(item));
    }

    /** @type {Record<string, any>} */
    const clean = Object.create(null);
    for (const key of Object.keys(input)) {
        if (isDangerousKey(key)) {
            continue;
        }
        // @ts-ignore
        clean[key] = sanitizeObject(input[key]);
    }
    // @ts-ignore
    return clean;
}

/**
 * Safely parses a JSON string while stripping out prototype-polluting keys.
 * @param {string} jsonString - Raw JSON payload string
 * @returns {Record<string, any>} Sanitized JavaScript object
 */
function safeJsonParse(jsonString) {
    const parsed = JSON.parse(jsonString, (key, value) => {
        if (isDangerousKey(key)) {
            return undefined;
        }
        return value;
    });
    return sanitizeObject(parsed);
}

module.exports = {
    DANGEROUS_KEYS,
    isDangerousKey,
    sanitizeObject,
    safeJsonParse
};
