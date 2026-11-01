// @ts-check
'use strict';

/**
 * Set of allowed protocol schemes for MQTT and WebSocket connections.
 * @type {ReadonlySet<string>}
 */
const ALLOWED_PROTOCOLS = new Set(['mqtt:', 'mqtts:', 'ws:', 'wss:']);

const LOCAL_HOSTS = new Set([
    'localhost',
    'metadata.google.internal',
    'instance-data',
    'metadata',
    '::1',
    '::',
    '0:0:0:0:0:0:0:1',
    '0:0:0:0:0:0:0:0'
]);

/**
 * Checks whether an IP or hostname is a loopback, link-local, or cloud metadata address.
 * @param {string} hostname - Hostname or IP to check
 * @returns {boolean} True if the host is local or cloud metadata
 */
function isLoopbackOrLinkLocal(hostname) {
    if (!hostname || typeof hostname !== 'string') return false;
    let host = hostname.toLowerCase().trim();

    // Strip square brackets for IPv6 if present
    if (host.startsWith('[') && host.endsWith(']')) {
        host = host.slice(1, -1);
    }

    // Strip trailing dots (FQDN representation, e.g. "localhost.", "127.0.0.1.")
    host = host.replace(/\.+$/, '');

    // Hostname checks for loopback, local domains, and cloud metadata endpoints
    if (LOCAL_HOSTS.has(host)) return true;
    if (
        host.endsWith('.localhost') ||
        host.endsWith('.local') ||
        host.endsWith('.localdomain') ||
        host.endsWith('.internal') ||
        host.endsWith('.metadata.google.internal') ||
        host.endsWith('.instance-data')
    ) {
        return true;
    }

    // IPv6 Link-Local (fe80::/10 covers fe80: to febf:)
    if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;

    // AWS IMDSv6 IPv6 metadata address (fd00:ec2::254)
    if (host === 'fd00:ec2::254' || host.startsWith('fd00:ec2:')) return true;

    // Alibaba Cloud metadata service
    if (host === '100.100.100.200') return true;

    // IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1 or WHATWG normalized ::ffff:7f00:1)
    if (host.startsWith('::ffff:') || host.startsWith('::ffff:0:')) {
        const rest = host.replace(/^::ffff:/, '');
        const hexParts = rest.split(':');
        if (hexParts.length === 2) {
            const high = parseInt(hexParts[0], 16);
            const low = parseInt(hexParts[1], 16);
            if (
                !isNaN(high) &&
                !isNaN(low) &&
                high >= 0 &&
                high <= 0xffff &&
                low >= 0 &&
                low <= 0xffff
            ) {
                const val = ((high << 16) | low) >>> 0;
                const firstOctet = (val >>> 24) & 0xff;
                const firstTwo = (val >>> 16) & 0xffff;
                if (firstOctet === 127 || firstOctet === 0) return true;
                if (firstTwo === ((169 << 8) | 254)) return true;
            }
        }
        host = rest;
    }

    // IPv4-compatible IPv6 addresses (e.g. ::127.0.0.1 or ::169.254.169.254)
    if (host.startsWith('::') && !host.includes(':')) {
        host = host.slice(2);
    }

    // IPv4 parsing (handles 1, 2, 3, or 4 parts with decimal, octal, or hex numbers)
    const parts = host.split('.');
    if (parts.length >= 1 && parts.length <= 4) {
        const nums = [];
        for (const part of parts) {
            if (!part) return false;
            let n;
            if (part.startsWith('0x') || part.startsWith('0X')) {
                n = parseInt(part, 16);
            } else if (part.startsWith('0') && part.length > 1 && /^\d+$/.test(part)) {
                n = parseInt(part, 8);
            } else if (/^\d+$/.test(part)) {
                n = parseInt(part, 10);
            } else {
                return false;
            }
            if (isNaN(n) || n < 0) return false;
            nums.push(n);
        }

        let val;
        if (nums.length === 1) {
            if (nums[0] > 0xffffffff) return false;
            val = nums[0];
        } else if (nums.length === 2) {
            if (nums[0] > 255 || nums[1] > 0xffffff) return false;
            val = (nums[0] << 24) | nums[1];
        } else if (nums.length === 3) {
            if (nums[0] > 255 || nums[1] > 255 || nums[2] > 0xffff) return false;
            val = (nums[0] << 24) | (nums[1] << 16) | nums[2];
        } else if (nums.length === 4) {
            if (nums.some((x) => x > 255)) return false;
            val = ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
        }
        val = val >>> 0;

        const firstOctet = (val >>> 24) & 0xff;
        const firstTwo = (val >>> 16) & 0xffff;

        if (firstOctet === 127 || firstOctet === 0) return true;
        if (firstTwo === ((169 << 8) | 254)) return true;
    }

    return false;
}

/**
 * Validates broker URL scheme and prevents SSRF to local/metadata endpoints.
 * @param {string} brokerUrl - Target broker URL
 * @param {boolean|{allowLocal?: boolean}} [optionsOrAllowLocal=false] - Local allowance flag
 * @returns {URL} Validated WHATWG URL instance
 * @throws {Error} If URL or protocol is invalid or forbidden
 */
function validateBrokerUrl(brokerUrl, optionsOrAllowLocal = false) {
    if (!brokerUrl || typeof brokerUrl !== 'string' || !brokerUrl.trim()) {
        throw new Error('Broker URL is required and must be a string.');
    }

    const trimmed = brokerUrl.trim();
    const allowLocal =
        typeof optionsOrAllowLocal === 'boolean'
            ? optionsOrAllowLocal
            : Boolean(optionsOrAllowLocal && optionsOrAllowLocal.allowLocal);

    /** @type {URL} */
    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch (err) {
        throw new Error(`Invalid broker URL format "${brokerUrl}": ${err.message}`, { cause: err });
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
        throw new Error(
            `Invalid broker protocol "${parsed.protocol}". Allowed protocols are: mqtt://, mqtts://, ws://, wss://`
        );
    }

    if (!parsed.hostname) {
        throw new Error(`Invalid broker URL format "${brokerUrl}": Hostname is missing.`);
    }

    if (!allowLocal && isLoopbackOrLinkLocal(parsed.hostname)) {
        throw new Error(
            `Connection to loopback or link-local address "${parsed.hostname}" is blocked for SSRF prevention. Use --allow-local to permit.`
        );
    }

    return parsed;
}

module.exports = {
    ALLOWED_PROTOCOLS,
    isLoopbackOrLinkLocal,
    validateBrokerUrl
};
