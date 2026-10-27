const deviceGpsStates = new Map();

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
// 1. Domain Readings Generators
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

    return {
        TEMPERATURE: { value: temp, unit: '°C', quality },
        HUMIDITY: { value: hum, unit: '%RH', quality },
        SMOKE_PPM: { value: smoke, unit: 'ppm', quality },
        CO2_PPM: { value: co2, unit: 'ppm', quality },
        PRESSURE: { value: pressure, unit: 'hPa', quality }
    };
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

    return {
        VOLTAGE_V: { value: voltage, unit: 'V', quality },
        CURRENT_A: { value: current, unit: 'A', quality },
        POWER_W: { value: power, unit: 'W', quality },
        VIBRATION_G: { value: vibration, unit: 'g', quality },
        TEMPERATURE: { value: temp, unit: '°C', quality }
    };
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

    return {
        PM25: { value: pm25, unit: 'µg/m³', quality },
        PM10: { value: pm10, unit: 'µg/m³', quality },
        VOC_INDEX: { value: voc, unit: 'index', quality },
        CO2_PPM: { value: co2, unit: 'ppm', quality },
        O3_PPB: { value: o3, unit: 'ppb', quality }
    };
}

function generateGpsReadings(gps, quality) {
    return {
        LATITUDE: { value: parseFloat(gps.latitude.toFixed(6)), unit: '°', quality },
        LONGITUDE: { value: parseFloat(gps.longitude.toFixed(6)), unit: '°', quality },
        SPEED: { value: parseFloat(gps.speed.toFixed(2)), unit: 'km/h', quality }
    };
}

function generateEdgeMetadata() {
    return {
        firmwareVersion: '3.2.0',
        rssi: -60 - Math.floor(Math.random() * 25),
        batteryPct: Math.floor(Math.random() * 20 + 80),
        uptimeSeconds: Math.floor(process.uptime()),
        protocol: 'MQTT'
    };
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

    // รองรับ Custom Template
    if (options.template) {
        return options.template
            .replace(/\{\{timestamp\}\}/g, () => new Date().toISOString())
            .replace(/\{\{epochMs\}\}/g, () => Date.now())
            .replace(/\{\{deviceId\}\}/g, () => devId)
            .replace(/\{\{randomInt\}\}/g, () => Math.floor(Math.random() * 100))
            .replace(/\{\{randomFloat\}\}/g, () => parseFloat((Math.random() * 100).toFixed(2)));
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
    // 2.1 Schema v2 Generation
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

        const payloadV2 = {
            deviceId: devId,
            schemaVersion: 2,
            timestamp: timestamp,
            readings: readings,
            edge: generateEdgeMetadata()
        };

        if (options.orgId) {
            payloadV2.organizationId = options.orgId;
        }

        return JSON.stringify(payloadV2);
    }

    // ──────────────────────────────────────────────
    // 2.2 Schema v1 Generation (Backward Compatibility)
    // ──────────────────────────────────────────────
    const payloadV1 = {
        deviceId: devId,
        timestamp: timestamp
    };

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

module.exports = { generatePayload };
