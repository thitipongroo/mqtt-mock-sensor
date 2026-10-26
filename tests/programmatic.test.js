const rootModule = require('../index');
const srcModule = require('../src/index');

describe('Programmatic Module Exports', () => {
    describe('Root Entry Point (index.js)', () => {
        test('should cleanly export generatePayload and SimulationRunner', () => {
            expect(typeof rootModule.generatePayload).toBe('function');
            expect(typeof rootModule.SimulationRunner).toBe('function');
            expect(typeof rootModule.ClientManager).toBe('function');
            expect(typeof rootModule.CsvReplayer).toBe('function');
            expect(typeof rootModule.ShadowManager).toBe('function');
        });

        test('generatePayload should generate valid telemetry JSON without CLI', () => {
            const raw = rootModule.generatePayload('env', {
                deviceId: 'test-device-01',
                schemaVersion: 2
            });
            const parsed = JSON.parse(raw);
            expect(parsed.deviceId).toBe('test-device-01');
            expect(parsed.schemaVersion).toBe(2);
            expect(parsed.readings).toBeDefined();
            expect(parsed.readings.TEMPERATURE).toBeDefined();
        });
    });

    describe('Source Entry Point (src/index.js)', () => {
        test('should cleanly export core engine components', () => {
            expect(typeof srcModule.generatePayload).toBe('function');
            expect(typeof srcModule.SimulationRunner).toBe('function');
            expect(typeof srcModule.ClientManager).toBe('function');
            expect(typeof srcModule.CsvReplayer).toBe('function');
            expect(typeof srcModule.ShadowManager).toBe('function');
        });

        test('generatePayload from src should generate v1 schema telemetry', () => {
            const raw = srcModule.generatePayload('env', {
                deviceId: 'test-device-v1',
                schemaVersion: 1
            });
            const parsed = JSON.parse(raw);
            expect(parsed.deviceId).toBe('test-device-v1');
            expect(parsed.temperature).toBeDefined();
            expect(parsed.humidity).toBeDefined();
        });
    });
});
