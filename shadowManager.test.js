const { ShadowManager } = require('./shadowManager');

describe('ShadowManager - Phase 3 Test Suite', () => {
    let mockClient;

    beforeEach(() => {
        mockClient = {
            subscribe: jest.fn((topics, cb) => cb(null)),
            publish: jest.fn((topic, message, opts, cb) => cb(null)),
            on: jest.fn()
        };
    });

    test('should subscribe to delta topic and publish initial reported state on init', () => {
        const orgId = '550e8400-e29b-41d4-a716-446655440000';
        const shadow = new ShadowManager(mockClient, orgId, 'dev-01', { interval: 3000 });
        shadow.init();

        expect(mockClient.subscribe).toHaveBeenCalled();
        expect(mockClient.publish).toHaveBeenCalledWith(
            `tenants/${orgId}/devices/dev-01/shadow/update`,
            expect.stringContaining('"samplingInterval":3000'),
            expect.any(Object),
            expect.any(Function)
        );
    });

    test('should reconcile delta, trigger callback, and send acknowledgment', () => {
        const orgId = '550e8400-e29b-41d4-a716-446655440000';
        const onConfigChange = jest.fn();
        const shadow = new ShadowManager(
            mockClient,
            orgId,
            'dev-01',
            { interval: 3000 },
            onConfigChange
        );

        const deltaPayload = JSON.stringify({
            state: { samplingInterval: 1000, heaterEnabled: true },
            version: 5
        });

        shadow.handleDelta(deltaPayload);

        // Check Callback recieve New Config
        expect(onConfigChange).toHaveBeenCalledWith({
            samplingInterval: 1000,
            heaterEnabled: true
        });
        expect(shadow.reportedState.samplingInterval).toBe(1000);
        expect(shadow.reportedState.heaterEnabled).toBe(true);

        // Check Publish Ack response to updateTopic
        expect(mockClient.publish).toHaveBeenCalledWith(
            `tenants/${orgId}/devices/dev-01/shadow/update`,
            expect.stringContaining('"version":5'),
            expect.any(Object),
            expect.any(Function)
        );
    });
});
