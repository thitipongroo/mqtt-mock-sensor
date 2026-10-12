const { generatePayload } = require('./payloadGenerator');

describe('Payload Generator - Core & Legacy Types', () => {
    test('should return a valid JSON string', () => {
        const result = generatePayload('env');
        expect(() => JSON.parse(result)).not.toThrow();
    });

    test('should contain default fields (deviceId, timestamp)', () => {
        const data = JSON.parse(generatePayload('env'));
        expect(data).toHaveProperty('deviceId');
        expect(data).toHaveProperty('timestamp');
    });

    test('should generate ENV metrics as numbers within normal range', () => {
        const data = JSON.parse(generatePayload('env'));
        expect(typeof data.temperature).toBe('number');
        expect(typeof data.humidity).toBe('number');
        expect(data.temperature).toBeGreaterThanOrEqual(20);
        expect(data.temperature).toBeLessThanOrEqual(35);
    });

    test('should generate POWER metrics as numbers', () => {
        const data = JSON.parse(generatePayload('power'));
        expect(typeof data.voltage).toBe('number');
        expect(typeof data.current).toBe('number');
        expect(typeof data.power).toBe('number');
    });

    test('should accept custom deviceId option', () => {
        const data = JSON.parse(generatePayload('env', { deviceId: 'custom-sensor-99' }));
        expect(data.deviceId).toBe('custom-sensor-99');
    });

    test('should fallback gracefully if type is undefined', () => {
        expect(() => generatePayload()).not.toThrow();
    });
});

describe('Payload Generator - GPS State & Multi-Device Isolation', () => {
    test('should generate separate GPS trajectories for different devices', () => {
        const devA = JSON.parse(generatePayload('gps', { deviceId: 'truck-A' }));
        const devB = JSON.parse(generatePayload('gps', { deviceId: 'truck-B' }));
        expect(devA.latitude).not.toBe(devB.latitude);
        expect(devA.longitude).not.toBe(devB.longitude);
    });

    test('should continuously drift coordinates for the same device (Trajectory)', () => {
        const tick1 = JSON.parse(generatePayload('gps', { deviceId: 'drone-01' }));
        const tick2 = JSON.parse(generatePayload('gps', { deviceId: 'drone-01' }));
        expect(tick1.latitude !== tick2.latitude || tick1.longitude !== tick2.longitude).toBe(true);
    });
});

describe('Payload Generator - Custom Template Engine', () => {
    test('should replace all template placeholders correctly', () => {
        const template = JSON.stringify({
            id: '{{deviceId}}',
            iso: '{{timestamp}}',
            epoch: '{{epochMs}}',
            valInt: '{{randomInt}}',
            valFloat: '{{randomFloat}}'
        });
        const result = generatePayload('custom', {
            deviceId: 'gateway-node-1',
            template
        });
        const parsed = JSON.parse(result);
        expect(parsed.id).toBe('gateway-node-1');
        expect(new Date(parsed.iso).toString()).not.toBe('Invalid Date');
        expect(Number(parsed.epoch)).toBeGreaterThan(0);
        expect(Number(parsed.valInt)).toBeGreaterThanOrEqual(0);
        expect(Number(parsed.valFloat)).toBeGreaterThanOrEqual(0);
    });

    test('should evaluate multiple random placeholders independently', () => {
        const template = '{"a": {{randomInt}}, "b": {{randomInt}}}';
        const result = generatePayload('custom', { template });
        expect(() => JSON.parse(result)).not.toThrow();
    });
});

describe('Payload Generator - Anomaly & Chaos Injection', () => {
    test('should inject extreme Voltage anomaly when anomalyRate is 100%', () => {
        const data = JSON.parse(generatePayload('power', { anomalyRate: 100 }));
        expect(data.voltage).toBe(380.0);
    });

    test('should inject extreme Temperature anomaly when anomalyRate is 100%', () => {
        const data = JSON.parse(generatePayload('env', { anomalyRate: 100 }));
        expect(data.temperature).toBe(99.9);
    });

    test('should generate normal metrics when anomalyRate is 0%', () => {
        const powerData = JSON.parse(generatePayload('power', { anomalyRate: 0 }));
        expect(powerData.voltage).toBeLessThan(300.0);

        const envData = JSON.parse(generatePayload('env', { anomalyRate: 0 }));
        expect(envData.temperature).toBeLessThan(40.0);
    });
});
