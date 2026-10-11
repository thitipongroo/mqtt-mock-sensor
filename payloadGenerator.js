function generatePayload(type = 'env', options = {}) {
    let payload = {
        deviceId: options.deviceId || `mock-device-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString()
    };

    switch (type.toLowerCase()) {
        case 'gps':
            payload.latitude = parseFloat((Math.random() * 180 - 90).toFixed(6));
            payload.longitude = parseFloat((Math.random() * 360 - 180).toFixed(6));
            payload.speed = parseFloat((Math.random() * 100).toFixed(2));
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
