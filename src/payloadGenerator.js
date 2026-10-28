const deviceGpsStates = new Map();

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Checks whether a property key is dangerous (can cause prototype pollution).
 * @param {*} key
 * @returns {boolean}
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
 * Sanitizes an object recursively by stripping prototype-polluting properties
 * and storing mappings in prototype-less objects (Object.create(null)).
 * @param {*} input
 * @returns {*}
 */
function sanitizeObject(input) {
    if (input === null || typeof input !== 'object') {
        return input;
    }

    if (Array.isArray(input)) {
        return input.map((item) => sanitizeObject(item));
    }

    const clean = Object.create(null);
    for (const key of Object.keys(input)) {
        if (isDangerousKey(key)) {
            continue;
        }
        clean[key] = sanitizeObject(input[key]);
    }
    return clean;
}

/**
 * Safely parses a JSON string while stripping out prototype-polluting properties.
 * @param {string} jsonString
 * @returns {Object}
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

function getDeviceGps(devId) {
    if (!deviceGpsStates.has(devId)) {
        deviceGpsStates.set(devId, {
            latitude: 13.7563 + (Math.random() - 0.5) * 0.05,
            longitude: 100.5018 + (Math.random() - 0.5) * 0.05,
            speed: 30.0 + Math.random() * 20.0
        });
    }
    return deviceGpsStates.get(devId);
}

function randomInRange(min, max, decimals = 2) {
    const val = Math.random() * (max - min) + min;
    return parseFloat(val.toFixed(decimals));
}

// ──────────────────────────────────────────────────────────
// 1. Domain Readings Generators (Prototype-less Objects)
// ──────────────────────────────────────────────────────────

function generateEnvReadings(anomalyMode, quality) {
    let temp = randomInRange(22.0, 27.0);
    let hum = randomInRange(50.0, 65.0);
    let smoke = randomInRange(0.01, 0.05);
    const co2 = randomInRange(400.0, 550.0, 1);
    const pressure = randomInRange(1012.0, 1015.0, 1);

    if (anomalyMode === 'warning') {
        temp = randomInRange(38.0, 44.0);
        hum = randomInRange(75.0, 85.0);
        smoke = randomInRange(3.0, 5.0);
    } else if (anomalyMode === 'critical') {
        temp = randomInRange(65.0, 85.0);
        hum = randomInRange(90.0, 98.0);
        smoke = randomInRange(25.0, 50.0);
    } else if (anomalyMode === 'out-of-bounds') {
        temp = 250.0; // ละเมิด TEMP_MAX (200.0) ใน Sentinel Ingestion -> ตก DLQ
        hum = -10.0; // ละเมิด HUM_MIN (0.0)
    }

    const readings = Object.create(null);
    readings.TEMPERATURE = Object.assign(Object.create(null), { value: temp, unit: '°C', quality });
    readings.HUMIDITY = Object.assign(Object.create(null), { value: hum, unit: '%RH', quality });
    readings.SMOKE_PPM = Object.assign(Object.create(null), { value: smoke, unit: 'ppm', quality });
    readings.CO2_PPM = Object.assign(Object.create(null), { value: co2, unit: 'ppm', quality });
    readings.PRESSURE = Object.assign(Object.create(null), {
        value: pressure,
        unit: 'hPa',
        quality
    });
    return readings;
}

function generateIndustrialReadings(anomalyMode, quality) {
    let voltage = randomInRange(218.0, 222.0, 1);
    let current = randomInRange(4.0, 6.0);
    let power = parseFloat((voltage * current).toFixed(1));
    let vibration = randomInRange(0.02, 0.06, 3);
    let temp = randomInRange(35.0, 42.0);

    if (anomalyMode === 'warning') {
        voltage = 245.0;
        current = 9.5;
        power = parseFloat((voltage * current).toFixed(1));
        vibration = 3.2;
        temp = 65.0;
    } else if (anomalyMode === 'critical') {
        voltage = 270.0;
        current = 18.0;
        power = parseFloat((voltage * current).toFixed(1));
        vibration = 9.5;
        temp = randomInRange(360.0, 395.0); // Thermal Overheat (> 350°C) triggering emergency alerts
    } else if (anomalyMode === 'out-of-bounds') {
        vibration = 150.0; // ละเมิด Physical Bounds
        voltage = 1200.0;
        temp = 550.0;
    }

    const readings = Object.create(null);
    readings.VOLTAGE_V = Object.assign(Object.create(null), { value: voltage, unit: 'V', quality });
    readings.CURRENT_A = Object.assign(Object.create(null), { value: current, unit: 'A', quality });
    readings.POWER_W = Object.assign(Object.create(null), { value: power, unit: 'W', quality });
    readings.VIBRATION_G = Object.assign(Object.create(null), {
        value: vibration,
        unit: 'g',
        quality
    });
    readings.TEMPERATURE = Object.assign(Object.create(null), { value: temp, unit: '°C', quality });
    return readings;
}

function generateAirReadings(anomalyMode, quality) {
    let pm25 = randomInRange(10.0, 25.0, 1);
    let pm10 = randomInRange(20.0, 40.0, 1);
    let voc = randomInRange(50.0, 100.0, 0);
    let co2 = randomInRange(420.0, 580.0, 1);
    let o3 = randomInRange(15.0, 30.0, 1);

    if (anomalyMode === 'warning') {
        pm25 = 75.0;
        pm10 = 110.0;
        voc = 220.0;
    } else if (anomalyMode === 'critical') {
        pm25 = 180.0;
        pm10 = 260.0;
        voc = 450.0;
        co2 = 2800.0;
    } else if (anomalyMode === 'out-of-bounds') {
        pm25 = 800.0; // เกิน physicalMax (500.0)
    }

    const readings = Object.create(null);
    readings.PM25 = Object.assign(Object.create(null), { value: pm25, unit: 'µg/m³', quality });
    readings.PM10 = Object.assign(Object.create(null), { value: pm10, unit: 'µg/m³', quality });
    readings.VOC_INDEX = Object.assign(Object.create(null), { value: voc, unit: 'index', quality });
    readings.CO2_PPM = Object.assign(Object.create(null), { value: co2, unit: 'ppm', quality });
    readings.O3_PPB = Object.assign(Object.create(null), { value: o3, unit: 'ppb', quality });
    return readings;
}

function generateGpsReadings(gps, quality) {
    const readings = Object.create(null);
    readings.LATITUDE = Object.assign(Object.create(null), {
        value: parseFloat(gps.latitude.toFixed(6)),
        unit: '°',
        quality
    });
    readings.LONGITUDE = Object.assign(Object.create(null), {
        value: parseFloat(gps.longitude.toFixed(6)),
        unit: '°',
        quality
    });
    readings.SPEED = Object.assign(Object.create(null), {
        value: parseFloat(gps.speed.toFixed(2)),
        unit: 'km/h',
        quality
    });
    return readings;
}

function generateEdgeMetadata() {
    const edge = Object.create(null);
    edge.firmwareVersion = '3.2.0';
    edge.rssi = -60 - Math.floor(Math.random() * 25);
    edge.batteryPct = Math.floor(Math.random() * 20 + 80);
    edge.uptimeSeconds = Math.floor(process.uptime());
    edge.protocol = 'MQTT';
    return edge;
}

// ──────────────────────────────────────────────────────────
// 2. Main Entry: generatePayload
// ──────────────────────────────────────────────────────────

function generatePayload(type = 'env', options = {}) {
    const devId = options.deviceId || 'mock-device-001';
    const schemaVersion = options.schemaVersion ? parseInt(options.schemaVersion, 10) : 1;
    const preset = (options.preset || type || 'env').toLowerCase();

    // ประเมินสถานะ Anomaly
    const isAnomaly = options.anomalyRate && Math.random() * 100 < options.anomalyRate;
    let anomalyMode = 'none';
    let quality = 'GOOD';

    if (isAnomaly) {
        anomalyMode = options.anomalyType || 'critical';
        if (anomalyMode === 'quality') {
            quality = Math.random() > 0.5 ? 'UNCERTAIN' : 'BAD';
        }
    }

    // รองรับ Custom Template ปลอดภัยจาก Prototype Pollution
    if (options.template) {
        const rendered = options.template
            .replace(/\{\{timestamp\}\}/g, () => new Date().toISOString())
            .replace(/\{\{epochMs\}\}/g, () => Date.now())
            .replace(/\{\{deviceId\}\}/g, () => devId)
            .replace(/\{\{randomInt\}\}/g, () => Math.floor(Math.random() * 100))
            .replace(/\{\{randomFloat\}\}/g, () => parseFloat((Math.random() * 100).toFixed(2)));

        try {
            const parsed = safeJsonParse(rendered);
            return JSON.stringify(parsed);
        } catch {
            return rendered;
        }
    }

    const gps = getDeviceGps(devId);
    if (preset === 'gps') {
        gps.latitude += (Math.random() - 0.5) * 0.001;
        gps.longitude += (Math.random() - 0.5) * 0.001;
        gps.speed = Math.max(0, Math.min(120, gps.speed + (Math.random() - 0.5) * 5));
    }

    const timestamp =
        schemaVersion >= 2 || options.epochTimestamp ? Date.now() : new Date().toISOString();

    // ──────────────────────────────────────────────
    // 2.1 Schema v2 Generation (Prototype-less)
    // ──────────────────────────────────────────────
    if (schemaVersion >= 2) {
        let readings;
        switch (preset) {
            case 'sentinel-industrial':
            case 'industrial':
            case 'power':
                readings = generateIndustrialReadings(anomalyMode, quality);
                break;
            case 'sentinel-air':
            case 'air':
                readings = generateAirReadings(anomalyMode, quality);
                break;
            case 'gps':
                readings = generateGpsReadings(gps, quality);
                break;
            case 'sentinel-env':
            case 'env':
            default:
                readings = generateEnvReadings(anomalyMode, quality);
                break;
        }

        const payloadV2 = Object.create(null);
        payloadV2.deviceId = devId;
        payloadV2.schemaVersion = 2;
        payloadV2.timestamp = timestamp;
        payloadV2.readings = readings;
        payloadV2.edge = generateEdgeMetadata();

        if (options.orgId) {
            payloadV2.organizationId = options.orgId;
        }

        return JSON.stringify(payloadV2);
    }

    // ──────────────────────────────────────────────
    // 2.2 Schema v1 Generation (Backward Compatibility)
    // ──────────────────────────────────────────────
    const payloadV1 = Object.create(null);
    payloadV1.deviceId = devId;
    payloadV1.timestamp = timestamp;

    if (options.orgId) {
        payloadV1.organizationId = options.orgId;
    }

    switch (preset) {
        case 'gps':
            payloadV1.latitude = parseFloat(gps.latitude.toFixed(6));
            payloadV1.longitude = parseFloat(gps.longitude.toFixed(6));
            payloadV1.speed = parseFloat(gps.speed.toFixed(2));
            break;
        case 'sentinel-industrial':
        case 'industrial':
        case 'power': {
            const isCrit = anomalyMode === 'critical';
            payloadV1.voltage = isCrit ? 380.0 : randomInRange(210.0, 230.0);
            payloadV1.current = randomInRange(1.0, 10.0);
            payloadV1.power = parseFloat((payloadV1.voltage * payloadV1.current).toFixed(2));
            break;
        }
        case 'sentinel-env':
        case 'env':
        default: {
            if (anomalyMode === 'critical') {
                payloadV1.temperature = 99.9;
                payloadV1.humidity = 95.0;
                payloadV1.smokePpm = 25.0;
            } else if (anomalyMode === 'out-of-bounds') {
                payloadV1.temperature = 250.0;
                payloadV1.humidity = -10.0;
            } else {
                payloadV1.temperature = randomInRange(20.0, 35.0);
                payloadV1.humidity = randomInRange(40.0, 80.0);
                payloadV1.smokePpm = 0.0;
            }
            break;
        }
    }

    return JSON.stringify(payloadV1);
}

module.exports = {
    generatePayload,
    sanitizeObject,
    isDangerousKey,
    safeJsonParse
};
