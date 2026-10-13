const { generatePayload } = require('./payloadGenerator');

describe('Payload Generator - Phase 2 Test Suite', () => {
    describe('Sentinel Domain Presets', () => {
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

    describe('Smart Anomaly & Alert Engine', () => {
        test('should generate CRITICAL anomaly values above thresholds', () => {
            const raw = generatePayload('env', {
                preset: 'sentinel-env',
                schemaVersion: 2,
                anomalyRate: 100,
                anomalyType: 'critical'
            });
            const data = JSON.parse(raw);

            // Sentinel Alerting Thresholds: Temp > 50°C, Smoke > 10 ppm
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

            // Sentinel TEMP_MAX = 200.0, HUM_MIN = 0.0
            expect(data.readings.TEMPERATURE.value).toBeGreaterThan(200.0);
            expect(data.readings.HUMIDITY.value).toBeLessThan(0.0);
        });
    });
});
