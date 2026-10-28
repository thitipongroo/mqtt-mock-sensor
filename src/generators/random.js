// @ts-check
'use strict';

/**
 * Returns a random floating-point number within a range formatted to decimals.
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {number}
 */
function randomInRange(min, max, decimals = 2) {
    const val = Math.random() * (max - min) + min;
    return parseFloat(val.toFixed(decimals));
}

module.exports = {
    randomInRange
};
