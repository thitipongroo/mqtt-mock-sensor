const { generatePayload } = require('./payloadGenerator');

describe('Payload Generator', () => {
    test('should return a valid JSON string', () => {
        const result = generatePayload('env');
        expect(() => JSON.parse(result)).not.toThrow();
    });

    test('should contain default fields (deviceId, timestamp)', () => {
        const data = JSON.parse(generatePayload('env'));
        expect(data).toHaveProperty('deviceId');
        expect(data).toHaveProperty('timestamp');
    });

    test('should generate ENV metrics correctly', () => {
        const data = JSON.parse(generatePayload('env'));
        expect(data).toHaveProperty('temperature');
        expect(data).toHaveProperty('humidity');
    });

    test('should generate GPS metrics correctly', () => {
        const data = JSON.parse(generatePayload('gps'));
        expect(data).toHaveProperty('latitude');
        expect(data).toHaveProperty('longitude');
        expect(data).toHaveProperty('speed');
    });

    test('should generate POWER metrics correctly', () => {
        const data = JSON.parse(generatePayload('power'));
        expect(data).toHaveProperty('voltage');
        expect(data).toHaveProperty('current');
        expect(data).toHaveProperty('power');
    });
});
