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

function generateV2Readings(type, isAnomaly, gps) {
    switch (String(type).toLowerCase()) {
        case 'gps':
            return {
                LATITUDE: {
                    value: parseFloat(gps.latitude.toFixed(6)),
                    unit: '°',
                    quality: 'GOOD'
                },
                LONGITUDE: {
                    value: parseFloat(gps.longitude.toFixed(6)),
                    unit: '°',
                    quality: 'GOOD'
                },
                SPEED: { value: parseFloat(gps.speed.toFixed(2)), unit: 'km/h', quality: 'GOOD' }
            };
        case 'power': {
            const voltage = isAnomaly ? 380.0 : parseFloat((Math.random() * 20 + 210).toFixed(2));
            const current = parseFloat((Math.random() * 10).toFixed(2));
            const power = parseFloat((voltage * current).toFixed(2));
            return {
                VOLTAGE_V: { value: voltage, unit: 'V', quality: 'GOOD' },
                CURRENT_A: { value: current, unit: 'A', quality: 'GOOD' },
                POWER_W: { value: power, unit: 'W', quality: 'GOOD' }
            };
        }
        case 'env':
        default: {
            const temp = isAnomaly ? 99.9 : parseFloat((Math.random() * 15 + 20).toFixed(2));
            const hum = parseFloat((Math.random() * 40 + 40).toFixed(2));
            return {
                TEMPERATURE: { value: temp, unit: '°C', quality: 'GOOD' },
                HUMIDITY: { value: hum, unit: '%RH', quality: 'GOOD' },
                SMOKE_PPM: { value: isAnomaly ? 15.5 : 0.0, unit: 'ppm', quality: 'GOOD' }
            };
        }
    }
}

function generateEdgeMetadata() {
    return {
        firmwareVersion: '3.1.0',
        rssi: -60 - Math.floor(Math.random() * 25),
        batteryPct: Math.floor(Math.random() * 20 + 80),
        uptimeSeconds: Math.floor(process.uptime()),
        protocol: 'MQTT'
    };
}

function generatePayload(type = 'env', options = {}) {
    const devId = options.deviceId || 'mock-device-001';
    const isAnomaly = options.anomalyRate && Math.random() * 100 < options.anomalyRate;
    const schemaVersion = options.schemaVersion ? parseInt(options.schemaVersion, 10) : 1;

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
    if (String(type).toLowerCase() === 'gps') {
        gps.latitude += (Math.random() - 0.5) * 0.001;
        gps.longitude += (Math.random() - 0.5) * 0.001;
        gps.speed = Math.max(0, Math.min(120, gps.speed + (Math.random() - 0.5) * 5));
    }

    // Timestamp: Schema v2 || epochTimestamp use Epoch ms
    const timestamp =
        schemaVersion >= 2 || options.epochTimestamp ? Date.now() : new Date().toISOString();

    // Schema v2 Generation
    if (schemaVersion >= 2) {
        const payloadV2 = {
            deviceId: devId,
            schemaVersion: 2,
            timestamp: timestamp,
            readings: generateV2Readings(type, isAnomaly, gps),
            edge: generateEdgeMetadata()
        };

        if (options.orgId) {
            payloadV2.organizationId = options.orgId;
        }

        return JSON.stringify(payloadV2);
    }

    // Schema v1 Generation (Backward Compatible)
    const payloadV1 = {
        deviceId: devId,
        timestamp: timestamp
    };

    if (options.orgId) {
        payloadV1.organizationId = options.orgId;
    }

    switch (String(type).toLowerCase()) {
        case 'gps':
            payloadV1.latitude = parseFloat(gps.latitude.toFixed(6));
            payloadV1.longitude = parseFloat(gps.longitude.toFixed(6));
            payloadV1.speed = parseFloat(gps.speed.toFixed(2));
            break;
        case 'power':
            payloadV1.voltage = isAnomaly
                ? 380.0
                : parseFloat((Math.random() * 20 + 210).toFixed(2));
            payloadV1.current = parseFloat((Math.random() * 10).toFixed(2));
            payloadV1.power = parseFloat((payloadV1.voltage * payloadV1.current).toFixed(2));
            break;
        case 'env':
        default:
            payloadV1.temperature = isAnomaly
                ? 99.9
                : parseFloat((Math.random() * 15 + 20).toFixed(2));
            payloadV1.humidity = parseFloat((Math.random() * 40 + 40).toFixed(2));
            break;
    }

    return JSON.stringify(payloadV1);
}

module.exports = { generatePayload };
