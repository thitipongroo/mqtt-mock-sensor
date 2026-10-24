const {
    parseSensorChoice,
    parseBrokerChoice,
    parseDeviceCount,
    runWizard
} = require('../src/wizardHelper');
const { Writable } = require('stream');

describe('wizardHelper', () => {
    describe('parseSensorChoice', () => {
        test('defaults to environmental sensor on empty or 1', () => {
            expect(parseSensorChoice('')).toEqual({ type: 'env', preset: 'sentinel-env' });
            expect(parseSensorChoice('1')).toEqual({ type: 'env', preset: 'sentinel-env' });
            expect(parseSensorChoice('env')).toEqual({ type: 'env', preset: 'sentinel-env' });
        });

        test('parses industrial sensor on 2 or industrial', () => {
            expect(parseSensorChoice('2')).toEqual({
                type: 'power',
                preset: 'sentinel-industrial'
            });
            expect(parseSensorChoice('industrial')).toEqual({
                type: 'power',
                preset: 'sentinel-industrial'
            });
        });

        test('parses gps sensor on 3 or gps', () => {
            expect(parseSensorChoice('3')).toEqual({ type: 'gps', preset: null });
            expect(parseSensorChoice('GPS')).toEqual({ type: 'gps', preset: null });
        });
    });

    describe('parseBrokerChoice', () => {
        test('defaults to HiveMQ on empty or 1', async () => {
            const fakeRl = {};
            expect(await parseBrokerChoice(fakeRl, '')).toBe('mqtts://broker.hivemq.com:8883');
            expect(await parseBrokerChoice(fakeRl, '1')).toBe('mqtts://broker.hivemq.com:8883');
        });

        test('prompts for custom URL when 2 is chosen', async () => {
            const fakeRl = {
                question: (prompt, cb) => cb('mqtt://my-broker.local:1883')
            };
            expect(await parseBrokerChoice(fakeRl, '2')).toBe('mqtt://my-broker.local:1883');
        });

        test('falls back to localhost if custom URL input is empty', async () => {
            const fakeRl = {
                question: (prompt, cb) => cb('')
            };
            expect(await parseBrokerChoice(fakeRl, '2')).toBe('mqtt://localhost:1883');
        });
    });

    describe('parseDeviceCount', () => {
        test('defaults to 1 on empty or invalid input', () => {
            expect(parseDeviceCount('')).toBe(1);
            expect(parseDeviceCount('abc')).toBe(1);
            expect(parseDeviceCount('0')).toBe(1);
            expect(parseDeviceCount('-5')).toBe(1);
        });

        test('parses valid numbers', () => {
            expect(parseDeviceCount('5')).toBe(5);
            expect(parseDeviceCount('25')).toBe(25);
        });

        test('caps count at 1000 for safety in wizard', () => {
            expect(parseDeviceCount('5000')).toBe(1000);
        });
    });

    describe('runWizard execution', () => {
        test('runs interactive stream and returns expected configuration', async () => {
            const { PassThrough } = require('stream');
            const input = new PassThrough();

            let outputData = '';
            const output = new Writable({
                write(chunk, encoding, callback) {
                    outputData += chunk.toString();
                    callback();
                }
            });

            // Simulate user typing after slight ticks
            setTimeout(() => input.write('1\n'), 10);
            setTimeout(() => input.write('1\n'), 20);
            setTimeout(() => input.write('5\n'), 30);

            const result = await runWizard(input, output);

            expect(result).toEqual({
                type: 'env',
                preset: 'sentinel-env',
                broker: 'mqtts://broker.hivemq.com:8883',
                devices: 5
            });
            expect(outputData).toContain('Setup Complete');
        });
    });
});
