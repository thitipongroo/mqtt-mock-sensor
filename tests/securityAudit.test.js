const {
    validateBrokerUrl,
    isLoopbackOrLinkLocal,
    ClientManager,
    ALLOWED_PROTOCOLS
} = require('../src/clientManager');
const {
    sanitizeObject,
    isDangerousKey,
    safeJsonParse,
    generatePayload
} = require('../src/payloadGenerator');
const { SimulationRunner } = require('../src/runner');

describe('Security & Boundary Protection Audit Suite', () => {
    describe('1. Broker URL Validation & SSRF Prevention (CWE-918)', () => {
        test('should allow valid MQTT and WebSocket protocol schemes', () => {
            const validUrls = [
                'mqtt://broker.hivemq.com:1883',
                'mqtts://broker.hivemq.com:8883',
                'ws://broker.example.com:8080/mqtt',
                'wss://broker.example.com:8081/mqtt'
            ];

            validUrls.forEach((url) => {
                expect(() => validateBrokerUrl(url)).not.toThrow();
                const parsed = validateBrokerUrl(url);
                expect(ALLOWED_PROTOCOLS.has(parsed.protocol)).toBe(true);
            });
        });

        test('should reject invalid or unsafe protocols (HTTP, HTTPS, FTP, File, Gopher)', () => {
            const unsafeUrls = [
                'http://169.254.169.254/latest/meta-data/',
                'https://example.com/api',
                'ftp://ftp.example.com:21',
                'file:///etc/passwd',
                'gopher://127.0.0.1:70/'
            ];

            unsafeUrls.forEach((url) => {
                expect(() => validateBrokerUrl(url)).toThrow(/Invalid broker protocol/i);
            });
        });

        test('should reject malformed or non-string URLs', () => {
            expect(() => validateBrokerUrl('')).toThrow(/Broker URL is required/i);
            expect(() => validateBrokerUrl(null)).toThrow(/Broker URL is required/i);
            expect(() => validateBrokerUrl('not-a-valid-url')).toThrow(
                /Invalid broker URL format/i
            );
        });

        test('should reject loopback addresses by default when allowLocal is false', () => {
            const loopbackUrls = [
                'mqtt://localhost:1883',
                'mqtt://127.0.0.1:1883',
                'mqtt://127.0.1.1:1883',
                'mqtt://0.0.0.0:1883',
                'mqtt://[::1]:1883',
                'mqtt://[::]:1883'
            ];

            loopbackUrls.forEach((url) => {
                expect(() => validateBrokerUrl(url, false)).toThrow(/blocked for SSRF prevention/i);
                expect(() => validateBrokerUrl(url, { allowLocal: false })).toThrow(
                    /blocked for SSRF prevention/i
                );
            });
        });

        test('should reject link-local and cloud metadata addresses (AWS/GCP/Azure)', () => {
            const metadataUrls = [
                'mqtt://169.254.169.254:1883',
                'mqtt://169.254.1.1:1883',
                'mqtt://metadata.google.internal:1883',
                'mqtt://[fe80::1]:1883'
            ];

            metadataUrls.forEach((url) => {
                expect(() => validateBrokerUrl(url, false)).toThrow(/blocked for SSRF prevention/i);
            });
        });

        test('should allow loopback addresses when allowLocal is true', () => {
            const allowed = validateBrokerUrl('mqtt://localhost:1883', true);
            expect(allowed.hostname).toBe('localhost');

            const allowedIp = validateBrokerUrl('mqtt://127.0.0.1:1883', { allowLocal: true });
            expect(allowedIp.hostname).toBe('127.0.0.1');
        });

        test('isLoopbackOrLinkLocal should accurately identify various local IP notations', () => {
            expect(isLoopbackOrLinkLocal('localhost')).toBe(true);
            expect(isLoopbackOrLinkLocal('my-host.local')).toBe(true);
            expect(isLoopbackOrLinkLocal('sub.localhost')).toBe(true);
            expect(isLoopbackOrLinkLocal('127.0.0.1')).toBe(true);
            expect(isLoopbackOrLinkLocal('127.1')).toBe(true);
            expect(isLoopbackOrLinkLocal('169.254.169.254')).toBe(true);
            expect(isLoopbackOrLinkLocal('[::1]')).toBe(true);
            expect(isLoopbackOrLinkLocal('[fe80::200:5aee:feaa:20a2]')).toBe(true);
            expect(isLoopbackOrLinkLocal('::ffff:127.0.0.1')).toBe(true);
            expect(isLoopbackOrLinkLocal('::ffff:169.254.169.254')).toBe(true);

            expect(isLoopbackOrLinkLocal('broker.hivemq.com')).toBe(false);
            expect(isLoopbackOrLinkLocal('mqtt.eclipseprojects.io')).toBe(false);
            expect(isLoopbackOrLinkLocal('8.8.8.8')).toBe(false);
        });

        test('ClientManager constructor should reject SSRF broker URLs unless allowLocal is set', () => {
            expect(() => {
                new ClientManager('mqtt://169.254.169.254:1883');
            }).toThrow(/blocked for SSRF prevention/i);

            expect(() => {
                new ClientManager('http://insecure-broker.com:1883');
            }).toThrow(/Invalid broker protocol/i);

            expect(() => {
                new ClientManager('mqtt://localhost:1883', { allowLocal: true });
            }).not.toThrow();
        });

        test('SimulationRunner constructor should validate broker URL when options.broker is provided', () => {
            expect(() => {
                new SimulationRunner({
                    options: { broker: 'mqtt://169.254.169.254:1883', allowLocal: false }
                });
            }).toThrow(/blocked for SSRF prevention/i);

            expect(() => {
                new SimulationRunner({
                    options: { broker: 'mqtts://broker.hivemq.com:8883', allowLocal: false }
                });
            }).not.toThrow();
        });
    });

    describe('2. Payload Generator Template Prototype Pollution (CWE-1321)', () => {
        beforeEach(() => {
            delete Object.prototype.polluted;
            delete Object.prototype.admin;
            delete Object.prototype.hacked;
        });

        afterEach(() => {
            delete Object.prototype.polluted;
            delete Object.prototype.admin;
            delete Object.prototype.hacked;
        });

        test('isDangerousKey should detect dangerous property names', () => {
            expect(isDangerousKey('__proto__')).toBe(true);
            expect(isDangerousKey('constructor')).toBe(true);
            expect(isDangerousKey('prototype')).toBe(true);
            expect(isDangerousKey('__proto__ ')).toBe(true);
            expect(isDangerousKey('CONSTRUCTOR')).toBe(true);

            expect(isDangerousKey('temperature')).toBe(false);
            expect(isDangerousKey('deviceId')).toBe(false);
            expect(isDangerousKey('timestamp')).toBe(false);
        });

        test('sanitizeObject should strip dangerous keys and create prototype-less objects', () => {
            const maliciousObj = {
                normalProp: 'safe',
                __proto__: { polluted: true },
                constructor: { prototype: { admin: true } },
                nested: {
                    level2: 'ok',
                    prototype: { hacked: true }
                }
            };

            const sanitized = sanitizeObject(maliciousObj);

            expect(sanitized.normalProp).toBe('safe');
            expect(Object.getPrototypeOf(sanitized)).toBeNull();
            expect(sanitized.__proto__).toBeUndefined();
            expect(sanitized.constructor).toBeUndefined();
            expect(sanitized.nested.level2).toBe('ok');
            expect(sanitized.nested.prototype).toBeUndefined();

            expect(Object.prototype.polluted).toBeUndefined();
            expect(Object.prototype.admin).toBeUndefined();
            expect(Object.prototype.hacked).toBeUndefined();
        });

        test('safeJsonParse should prevent prototype pollution from raw JSON string', () => {
            const jsonPayload =
                '{"deviceId":"dev-1","__proto__":{"polluted":true},"nested":{"constructor":123}}';
            const parsed = safeJsonParse(jsonPayload);

            expect(parsed.deviceId).toBe('dev-1');
            expect(parsed.__proto__).toBeUndefined();
            expect(parsed.nested.constructor).toBeUndefined();
            expect(Object.prototype.polluted).toBeUndefined();
        });

        test('generatePayload with custom template should sanitize prototype-polluting payloads', () => {
            const maliciousTemplate =
                '{"deviceId":"{{deviceId}}","temp":25.5,"__proto__":{"polluted":true},"constructor":{"prototype":{"admin":true}}}';

            const payloadStr = generatePayload('env', {
                template: maliciousTemplate,
                deviceId: 'sensor-999'
            });

            const parsed = JSON.parse(payloadStr);

            expect(parsed.deviceId).toBe('sensor-999');
            expect(parsed.temp).toBe(25.5);
            expect(payloadStr).not.toContain('"__proto__"');
            expect(payloadStr).not.toContain('"constructor"');
            expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(parsed, 'constructor')).toBe(false);
            expect(Object.prototype.polluted).toBeUndefined();
            expect(Object.prototype.admin).toBeUndefined();
        });

        test('generatePayload v1 and v2 should generate safe JSON without prototype pollution', () => {
            const v1Payload = generatePayload('env', { schemaVersion: 1, deviceId: 'test-v1' });
            const v2Payload = generatePayload('env', { schemaVersion: 2, deviceId: 'test-v2' });

            const parsedV1 = JSON.parse(v1Payload);
            const parsedV2 = JSON.parse(v2Payload);

            expect(parsedV1.deviceId).toBe('test-v1');
            expect(parsedV2.deviceId).toBe('test-v2');
            expect(parsedV2.schemaVersion).toBe(2);
            expect(parsedV2.readings).toBeDefined();

            expect(Object.prototype.polluted).toBeUndefined();
        });
    });

    describe('3. Process Signal & Connection Leak on Abort', () => {
        test('disconnectAll should end all active clients and clear activeClients array', (done) => {
            const mockClient1 = {
                end: jest.fn((force, cb) => {
                    if (cb) cb();
                })
            };
            const mockClient2 = {
                end: jest.fn((force, cb) => {
                    if (cb) cb();
                })
            };

            const manager = new ClientManager('mqtts://broker.hivemq.com:8883');
            manager.activeClients = [mockClient1, mockClient2];

            manager.disconnectAll(() => {
                expect(mockClient1.end).toHaveBeenCalledWith(false, expect.any(Function));
                expect(mockClient2.end).toHaveBeenCalledWith(false, expect.any(Function));
                expect(manager.activeClients).toEqual([]);
                done();
            });
        });

        test('disconnectAll should invoke callback immediately if activeClients is empty', (done) => {
            const manager = new ClientManager('mqtts://broker.hivemq.com:8883');
            expect(manager.activeClients.length).toBe(0);

            manager.disconnectAll(() => {
                expect(manager.activeClients).toEqual([]);
                done();
            });
        });

        test('SimulationRunner stop() should clear intervals, timeouts, and disconnect clients', async () => {
            const mockClientManager = {
                disconnectAll: jest.fn((cb) => {
                    if (cb) cb();
                })
            };

            const runner = new SimulationRunner({
                options: { broker: 'mqtts://broker.hivemq.com:8883', count: 10, interval: 5000 },
                deviceList: ['dev-1'],
                clientManager: mockClientManager
            });

            // Simulate active interval and timeout
            const intervalId = setInterval(() => {}, 10000);
            const timeoutId = setTimeout(() => {}, 10000);
            runner.activeIntervals.set('test-interval', intervalId);
            runner.activeTimeouts.add(timeoutId);

            expect(runner.activeIntervals.size).toBe(1);
            expect(runner.activeTimeouts.size).toBe(1);

            await runner.stop();

            expect(runner.activeIntervals.size).toBe(0);
            expect(runner.activeTimeouts.size).toBe(0);
            expect(mockClientManager.disconnectAll).toHaveBeenCalledTimes(1);
            expect(runner.isShuttingDown).toBe(true);
        });

        test('SimulationRunner shutdownAndExit cleans up signal listeners', () => {
            const mockClientManager = {
                disconnectAll: jest.fn((cb) => {
                    if (cb) cb();
                })
            };

            const runner = new SimulationRunner({
                options: { broker: 'mqtts://broker.hivemq.com:8883' },
                deviceList: ['dev-1'],
                clientManager: mockClientManager,
                onExit: jest.fn()
            });

            const dummySigint = () => {};
            const dummySigterm = () => {};
            runner.sigintListener = dummySigint;
            runner.sigtermListener = dummySigterm;
            process.on('SIGINT', dummySigint);
            process.on('SIGTERM', dummySigterm);

            runner.shutdownAndExit(0);

            expect(runner.sigintListener).toBeNull();
            expect(runner.sigtermListener).toBeNull();
            expect(runner.onExit).toHaveBeenCalledWith(0);
        });
    });
});
