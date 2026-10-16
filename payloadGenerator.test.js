const { generatePayload } = require('./payloadGenerator');

describe('Payload Generator - Complete Test Suite (Phase 1 & Phase 2)', () => {
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

    describe('Schema v2 Core Contract (Phase 1)', () => {
        test('should output valid Sentinel v2 structure with numeric epoch timestamp and edge metadata', () => {
            const raw = generatePayload('env', { schemaVersion: 2, deviceId: 'factory-dev-01' });
            const data = JSON.parse(raw);

            expect(data.deviceId).toBe('factory-dev-01');
            expect(data.schemaVersion).toBe(2);
            expect(typeof data.timestamp).toBe('number');
            expect(data).toHaveProperty('readings');
            expect(data.edge).toHaveProperty('firmwareVersion');
            expect(data.edge.protocol).toBe('MQTT');
        });

        test('should include organizationId when orgId option is provided', () => {
            const orgUuid = '550e8400-e29b-41d4-a716-446655440000';
            const raw = generatePayload('env', { schemaVersion: 2, orgId: orgUuid });
            const data = JSON.parse(raw);

            expect(data.organizationId).toBe(orgUuid);
        });

        test('should generate correct readings for type "gps" in Schema v2', () => {
            const raw = generatePayload('gps', { schemaVersion: 2 });
            const data = JSON.parse(raw);

            expect(data.readings).toHaveProperty('LATITUDE');
            expect(data.readings).toHaveProperty('LONGITUDE');
            expect(data.readings).toHaveProperty('SPEED');
        });

        test('should replace {{epochMs}} token in custom template', () => {
            const template = '{"id":"{{deviceId}}","time":{{epochMs}}}';
            const raw = generatePayload('env', { template, deviceId: 'test-1' });
            const data = JSON.parse(raw);

            expect(data.id).toBe('test-1');
            expect(typeof data.time).toBe('number');
        });
    });

    describe('Sentinel Domain Presets (Phase 2)', () => {
        test('should generate sentinel-env preset readings correctly', () => {
            const raw = generatePayload('env', { preset: 'sentinel-env', schemaVersion: 2 });
            const data = JSON.parse(raw);

            expect(data.schemaVersion).toBe(2);
            expect(data.readings).toHaveProperty('TEMPERATURE');
            expect(data.readings).toHaveProperty('HUMIDITY');
            expect(data.readings).toHaveProperty('SMOKE_PPM');
            expect(data.readings).toHaveProperty('CO2_PPM');
            expect(data.readings).toHaveProperty('PRESSURE');
            expect(data.readings.PRESSURE.unit).toBe('hPa');
            expect(data.readings.PRESSURE.quality).toBe('GOOD');
        });

        test('should generate sentinel-industrial preset readings correctly', () => {
            const raw = generatePayload('power', {
                preset: 'sentinel-industrial',
                schemaVersion: 2
            });
            const data = JSON.parse(raw);

            expect(data.schemaVersion).toBe(2);
            expect(data.readings).toHaveProperty('VOLTAGE_V');
            expect(data.readings).toHaveProperty('CURRENT_A');
            expect(data.readings).toHaveProperty('POWER_W');
            expect(data.readings).toHaveProperty('VIBRATION_G');
            expect(data.readings.VIBRATION_G.unit).toBe('g');
            expect(data.readings.VIBRATION_G.value).toBeGreaterThan(0);
        });

        test('should generate sentinel-air preset readings correctly', () => {
            const raw = generatePayload('env', { preset: 'sentinel-air', schemaVersion: 2 });
            const data = JSON.parse(raw);

            expect(data.schemaVersion).toBe(2);
            expect(data.readings).toHaveProperty('PM25');
            expect(data.readings).toHaveProperty('PM10');
            expect(data.readings).toHaveProperty('VOC_INDEX');
            expect(data.readings).toHaveProperty('CO2_PPM');
            expect(data.readings).toHaveProperty('O3_PPB');
            expect(data.readings.PM25.unit).toBe('µg/m³');
        });
    });

    describe('Smart Anomaly & Alert Engine (Phase 2)', () => {
        test('should generate CRITICAL anomaly values above thresholds', () => {
            const raw = generatePayload('env', {
                preset: 'sentinel-env',
                schemaVersion: 2,
                anomalyRate: 100,
                anomalyType: 'critical'
            });
            const data = JSON.parse(raw);

            expect(data.readings.TEMPERATURE.value).toBeGreaterThan(50.0);
            expect(data.readings.SMOKE_PPM.value).toBeGreaterThan(10.0);
        });

        test('should generate WARNING anomaly values in warning range', () => {
            const raw = generatePayload('env', {
                preset: 'sentinel-env',
                schemaVersion: 2,
                anomalyRate: 100,
                anomalyType: 'warning'
            });
            const data = JSON.parse(raw);

            expect(data.readings.TEMPERATURE.value).toBeGreaterThanOrEqual(38.0);
            expect(data.readings.TEMPERATURE.value).toBeLessThan(50.0);
            expect(data.readings.SMOKE_PPM.value).toBeGreaterThanOrEqual(3.0);
        });

        test('should inject UNCERTAIN or BAD data quality when anomalyType is quality', () => {
            const raw = generatePayload('env', {
                preset: 'sentinel-env',
                schemaVersion: 2,
                anomalyRate: 100,
                anomalyType: 'quality'
            });
            const data = JSON.parse(raw);

            expect(['UNCERTAIN', 'BAD']).toContain(data.readings.TEMPERATURE.quality);
        });

        test('should generate OUT-OF-BOUNDS values to test Sentinel DLQ validation', () => {
            const raw = generatePayload('env', {
                preset: 'sentinel-env',
                schemaVersion: 2,
                anomalyRate: 100,
                anomalyType: 'out-of-bounds'
            });
            const data = JSON.parse(raw);

            expect(data.readings.TEMPERATURE.value).toBeGreaterThan(200.0);
            expect(data.readings.HUMIDITY.value).toBeLessThan(0.0);
        });
    });
});
