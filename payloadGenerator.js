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

function generatePayload(type = 'env', options = {}) {
    const devId = options.deviceId || 'mock-device-001';
    const isAnomaly = options.anomalyRate && Math.random() * 100 < options.anomalyRate;

    if (options.template) {
        return options.template
            .replace(/\{\{timestamp\}\}/g, () => new Date().toISOString())
            .replace(/\{\{epochMs\}\}/g, () => Date.now())
            .replace(/\{\{deviceId\}\}/g, () => devId)
            .replace(/\{\{randomInt\}\}/g, () => Math.floor(Math.random() * 100))
            .replace(/\{\{randomFloat\}\}/g, () => parseFloat((Math.random() * 100).toFixed(2)));
    }

    const gps = getDeviceGps(devId);

    let payload = {
        deviceId: options.deviceId || `mock-device-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString()
    };

    switch (String(type).toLowerCase()) {
        case 'gps':
            gps.latitude += (Math.random() - 0.5) * 0.001;
            gps.longitude += (Math.random() - 0.5) * 0.001;
            gps.speed = Math.max(0, Math.min(120, gps.speed + (Math.random() - 0.5) * 5));
            payload.latitude = parseFloat(gps.latitude.toFixed(6));
            payload.longitude = parseFloat(gps.longitude.toFixed(6));
            payload.speed = parseFloat(gps.speed.toFixed(2));
            break;
        case 'power':
            payload.voltage = isAnomaly ? 380.0 : parseFloat((Math.random() * 20 + 210).toFixed(2));
            payload.current = parseFloat((Math.random() * 10).toFixed(2));
            payload.power = parseFloat((payload.voltage * payload.current).toFixed(2));
            break;
        case 'env':
        default:
            payload.temperature = isAnomaly
                ? 99.9
                : parseFloat((Math.random() * 15 + 20).toFixed(2));
            payload.humidity = parseFloat((Math.random() * 40 + 40).toFixed(2));
            break;
    }

    return JSON.stringify(payload);
}

module.exports = { generatePayload };
