const gpsState = {
    latitude: 13.7563,
    longitude: 100.5018,
    speed: 40.0
};

function generatePayload(type = 'env', options = {}) {
    let payload = {
        deviceId: options.deviceId || `mock-device-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString()
    };

    if (options.template) {
        let compiled = options.template
            .replace(/\{\{timestamp\}\}/g, new Date().toISOString())
            .replace(/\{\{deviceId\}\}/g, options.deviceId || 'mock-device-001')
            .replace(/\{\{randomInt\}\}/g, Math.floor(Math.random() * 100))
            .replace(/\{\{randomFloat\}\}/g, (Math.random() * 100).toFixed(2));
        return compiled;
    }

    switch (String(type).toLowerCase()) {
        case 'gps':
            // Estimate 50-100 / tick
            gpsState.latitude += (Math.random() - 0.5) * 0.001;
            gpsState.longitude += (Math.random() - 0.5) * 0.001;
            gpsState.speed = Math.max(0, Math.min(120, gpsState.speed + (Math.random() - 0.5) * 5));
            payload.latitude = parseFloat(gpsState.latitude.toFixed(6));
            payload.longitude = parseFloat(gpsState.longitude.toFixed(6));
            payload.speed = parseFloat(gpsState.speed.toFixed(2));
            break;
        case 'power':
            payload.voltage = parseFloat((Math.random() * 20 + 210).toFixed(2));
            payload.current = parseFloat((Math.random() * 10).toFixed(2));
            payload.power = parseFloat((payload.voltage * payload.current).toFixed(2));
            break;
        case 'env':
        default:
            payload.temperature = parseFloat((Math.random() * 15 + 20).toFixed(2));
            payload.humidity = parseFloat((Math.random() * 40 + 40).toFixed(2));
            break;
    }

    return JSON.stringify(payload);
}

module.exports = { generatePayload };
