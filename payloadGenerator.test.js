const { generatePayload } = require('./payloadGenerator');

describe('Payload Generator - Phase 1 Test Suite', () => {
    describe('Schema v1 (Backward Compatibility)', () => {
        test('should return valid JSON with ISO string timestamp by default', () => {
            const raw = generatePayload('env', { schemaVersion: 1 });
            const data = JSON.parse(raw);
            expect(data).toHaveProperty('deviceId');
            expect(typeof data.timestamp).toBe('string');
            expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            expect(data).toHaveProperty('temperature');
            expect(data).toHaveProperty('humidity');
        });

        test('should output numeric epoch timestamp when epochTimestamp is true in v1', () => {
            const raw = generatePayload('env', { schemaVersion: 1, epochTimestamp: true });
            const data = JSON.parse(raw);
            expect(typeof data.timestamp).toBe('number');
            expect(data.timestamp).toBeGreaterThan(1700000000000);
        });
    });

    describe('Schema v2 (Sentinel Standard)', () => {
        test('should output valid Sentinel v2 structure with numeric epoch timestamp', () => {
            const raw = generatePayload('env', { schemaVersion: 2, deviceId: 'factory-dev-01' });
            const data = JSON.parse(raw);

            expect(data.deviceId).toBe('factory-dev-01');
            expect(data.schemaVersion).toBe(2);
            expect(typeof data.timestamp).toBe('number');
            expect(data.timestamp).toBeGreaterThan(1700000000000);
            expect(data).toHaveProperty('readings');
            expect(data).toHaveProperty('edge');
        });

        test('should generate correct readings and quality for type "env"', () => {
            const raw = generatePayload('env', { schemaVersion: 2 });
            const data = JSON.parse(raw);

            expect(data.readings).toHaveProperty('TEMPERATURE');
            expect(data.readings.TEMPERATURE).toHaveProperty('value');
            expect(data.readings.TEMPERATURE.unit).toBe('°C');
            expect(data.readings.TEMPERATURE.quality).toBe('GOOD');

            expect(data.readings).toHaveProperty('HUMIDITY');
            expect(data.readings.HUMIDITY.unit).toBe('%RH');
            expect(data.readings.HUMIDITY.quality).toBe('GOOD');
        });

        test('should generate correct readings and quality for type "power"', () => {
            const raw = generatePayload('power', { schemaVersion: 2 });
            const data = JSON.parse(raw);

            expect(data.readings).toHaveProperty('VOLTAGE_V');
            expect(data.readings.VOLTAGE_V.unit).toBe('V');
            expect(data.readings).toHaveProperty('CURRENT_A');
            expect(data.readings).toHaveProperty('POWER_W');
        });

        test('should generate correct readings and quality for type "gps"', () => {
            const raw = generatePayload('gps', { schemaVersion: 2 });
            const data = JSON.parse(raw);

            expect(data.readings).toHaveProperty('LATITUDE');
            expect(data.readings).toHaveProperty('LONGITUDE');
            expect(data.readings).toHaveProperty('SPEED');
        });

        test('should include edge metadata fields', () => {
            const raw = generatePayload('env', { schemaVersion: 2 });
            const data = JSON.parse(raw);

            expect(data.edge).toHaveProperty('firmwareVersion');
            expect(data.edge).toHaveProperty('rssi');
            expect(data.edge).toHaveProperty('batteryPct');
            expect(data.edge).toHaveProperty('uptimeSeconds');
            expect(data.edge.protocol).toBe('MQTT');
        });

        test('should include organizationId when orgId option is provided', () => {
            const orgUuid = '550e8400-e29b-41d4-a716-446655440000';
            const raw = generatePayload('env', { schemaVersion: 2, orgId: orgUuid });
            const data = JSON.parse(raw);

            expect(data.organizationId).toBe(orgUuid);
        });
    });

    describe('Template Support', () => {
        test('should replace {{epochMs}} token correctly', () => {
            const template = '{"id":"{{deviceId}}","time":{{epochMs}}}';
            const raw = generatePayload('env', { template, deviceId: 'test-1' });
            const data = JSON.parse(raw);

            expect(data.id).toBe('test-1');
            expect(typeof data.time).toBe('number');
            expect(data.time).toBeGreaterThan(1700000000000);
        });
    });
});
