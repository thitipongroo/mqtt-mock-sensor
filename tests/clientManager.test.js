const mqtt = require('mqtt');
const { ClientManager, buildTlsOptions, getWillConfig } = require('../src/clientManager');

jest.mock('mqtt');

describe('ClientManager Test Suite', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('buildTlsOptions', () => {
        test('should return empty options when no TLS parameters provided', () => {
            const tls = buildTlsOptions({});
            expect(tls).toEqual({});
        });

        test('should set rejectUnauthorized to false when insecure is true', () => {
            const tls = buildTlsOptions({ insecure: true });
            expect(tls.rejectUnauthorized).toBe(false);
        });

        test('should accept Buffers for ca, cert, and key directly', () => {
            const caBuf = Buffer.from('test-ca');
            const certBuf = Buffer.from('test-cert');
            const keyBuf = Buffer.from('test-key');

            const tls = buildTlsOptions({ ca: caBuf, cert: certBuf, key: keyBuf });
            expect(tls.ca).toBe(caBuf);
            expect(tls.cert).toBe(certBuf);
            expect(tls.key).toBe(keyBuf);
        });
    });

    describe('getWillConfig', () => {
        test('should return null when willTopic is not specified', () => {
            expect(getWillConfig('dev-1', {})).toBeNull();
        });

        test('should replace deviceId and orgId tokens in willTopic and willMessage', () => {
            const will = getWillConfig('sensor-42', {
                willTopic: 'tenants/{orgId}/devices/{deviceId}/status',
                orgId: 'tenant-abc',
                willMessage: '{"device":"{deviceId}","status":"OFFLINE"}',
                willQos: 1,
                willRetain: true
            });

            expect(will).not.toBeNull();
            expect(will.topic).toBe('tenants/tenant-abc/devices/sensor-42/status');
            expect(will.payload.toString()).toBe('{"device":"sensor-42","status":"OFFLINE"}');
            expect(will.qos).toBe(1);
            expect(will.retain).toBe(true);
        });
    });

    describe('Standard MQTTS Authentication & Connection Options', () => {
        test('should seamlessly pass username and password over TLS (MQTTS)', () => {
            const brokerUrl = 'mqtts://broker.example.com:8883';
            const manager = new ClientManager(brokerUrl, {
                username: 'enterprise-user',
                password: 'super-secret-token'
            });

            const options = manager.createClientOptions('dev-101');
            expect(options.username).toBe('enterprise-user');
            expect(options.password).toBe('super-secret-token');
            expect(options.clientId).toMatch(/^mock_sensor_dev-101_/);
            expect(options.clean).toBe(true);
            expect(options.connectTimeout).toBe(5000);
        });

        test('should prioritize runtimeUsername and runtimePassword when set', () => {
            const manager = new ClientManager('mqtts://secure-broker.net:8883', {
                username: 'fallback-user',
                password: 'fallback-password',
                runtimeUsername: 'dynamic-user',
                runtimePassword: 'dynamic-token'
            });

            const options = manager.createClientOptions('dev-202');
            expect(options.username).toBe('dynamic-user');
            expect(options.password).toBe('dynamic-token');
        });

        test('should call mqtt.connect with broker URL and connection options', () => {
            const mockClientInstance = {
                on: jest.fn(),
                end: jest.fn((force, cb) => {
                    if (cb) cb();
                })
            };
            mqtt.connect.mockReturnValue(mockClientInstance);

            const brokerUrl = 'mqtts://custom-enterprise-broker.com:8883';
            const manager = new ClientManager(brokerUrl, {
                username: 'acme_user',
                password: 'acme_password',
                insecure: true
            });

            const client = manager.connectClient('dev-001');

            expect(mqtt.connect).toHaveBeenCalledTimes(1);
            const [passedUrl, passedOpts] = mqtt.connect.mock.calls[0];
            expect(passedUrl).toBe(brokerUrl);
            expect(passedOpts.username).toBe('acme_user');
            expect(passedOpts.password).toBe('acme_password');
            expect(passedOpts.rejectUnauthorized).toBe(false);
            expect(client).toBe(mockClientInstance);
            expect(manager.activeClients).toContain(mockClientInstance);
        });

        test('should cleanly disconnect all active clients', (done) => {
            const mockClient = {
                end: jest.fn((force, cb) => {
                    if (cb) cb();
                })
            };
            mqtt.connect.mockReturnValue(mockClient);

            const manager = new ClientManager('mqtt://localhost:1883');
            manager.connectClient('dev-1');
            manager.connectClient('dev-2');

            manager.disconnectAll(() => {
                expect(mockClient.end).toHaveBeenCalledTimes(2);
                done();
            });
        });
    });
});
