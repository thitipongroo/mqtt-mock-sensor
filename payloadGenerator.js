function generatePayload(type) {
    let payload = {
        deviceId: `mock-device-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString()
    };

    switch (type.toLowerCase()) {
        case 'gps':
            payload.latitude = (Math.random() * 180 - 90).toFixed(6);
            payload.longitude = (Math.random() * 360 - 180).toFixed(6);
            payload.speed = (Math.random() * 100).toFixed(2);
            break;
        case 'power':
            payload.voltage = (Math.random() * 20 + 210).toFixed(2);
            payload.current = (Math.random() * 10).toFixed(2);
            payload.power = (payload.voltage * payload.current).toFixed(2);
            break;
        case 'env':
        default:
            payload.temperature = (Math.random() * 15 + 20).toFixed(2);
            payload.humidity = (Math.random() * 40 + 40).toFixed(2);
            break;
    }

    return JSON.stringify(payload);
}

module.exports = { generatePayload };
