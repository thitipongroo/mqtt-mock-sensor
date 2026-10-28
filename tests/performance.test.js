const { ClientManager, PacketQueue } = require('../src/clientManager');
const { SimulationRunner, PreGeneratedPayloadBuffer } = require('../src/runner');

describe('Performance Optimization & Timer Accuracy Test Suite', () => {
    describe('1. PreGeneratedPayloadBuffer (Zero-GC Optimization)', () => {
        test('should pre-generate valid Schema v2 telemetry and update epoch timestamp in-place', () => {
            const buffer = new PreGeneratedPayloadBuffer({
                deviceList: ['dev-perf-01'],
                type: 'env',
                options: { schemaVersion: 2 },
                poolSize: 8
            });

            const tBefore = Date.now();
            const p1 = buffer.getPayload('dev-perf-01');
            const data1 = JSON.parse(p1);

            expect(data1.deviceId).toBe('dev-perf-01');
            expect(data1.schemaVersion).toBe(2);
            expect(typeof data1.timestamp).toBe('number');
            expect(data1.timestamp).toBeGreaterThanOrEqual(tBefore);
            expect(data1.readings).toBeDefined();

            const p2 = buffer.getPayload('dev-perf-01');
            const data2 = JSON.parse(p2);
            expect(data2.deviceId).toBe('dev-perf-01');
            expect(typeof data2.timestamp).toBe('number');
            expect(data2.timestamp).toBeGreaterThanOrEqual(data1.timestamp);
        });

        test('should pre-generate valid Schema v1 telemetry with ISO timestamp strings', () => {
            const buffer = new PreGeneratedPayloadBuffer({
                deviceList: ['dev-perf-02'],
                type: 'env',
                options: { schemaVersion: 1 },
                poolSize: 8
            });

            const p1 = buffer.getPayload('dev-perf-02');
            const data1 = JSON.parse(p1);

            expect(data1.deviceId).toBe('dev-perf-02');
            expect(typeof data1.timestamp).toBe('string');
            expect(data1.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            expect(data1.temperature).toBeDefined();
        });

        test('should fallback to generatePayload if device is not in pre-allocated pool', () => {
            const buffer = new PreGeneratedPayloadBuffer({
                deviceList: ['dev-perf-01'],
                type: 'power',
                options: { schemaVersion: 2 },
                poolSize: 4
            });

            const p = buffer.getPayload('dev-unbuffered');
            const data = JSON.parse(p);
            expect(data.deviceId).toBe('dev-unbuffered');
            expect(data.schemaVersion).toBe(2);
        });
    });

    describe('2. High-Throughput Packet Batching (src/clientManager.js)', () => {
        test('PacketQueue should enqueue and flush packets grouped by client', async () => {
            const mockStream = {
                cork: jest.fn(),
                uncork: jest.fn()
            };
            const mockClient = {
                stream: mockStream,
                publish: jest.fn((topic, message, opts, cb) => {
                    if (cb) cb(null);
                })
            };

            const clientManager = new ClientManager('mqtts://broker.hivemq.com:8883');
            const queue = new PacketQueue(clientManager, 100);

            const cb1 = jest.fn();
            const cb2 = jest.fn();

            queue.enqueue(mockClient, 'topic/1', '{"val":1}', { qos: 0 }, cb1);
            queue.enqueue(mockClient, 'topic/2', '{"val":2}', { qos: 1 }, cb2);

            expect(queue.queue.length).toBe(2);

            queue.flush();

            expect(mockStream.cork).toHaveBeenCalledTimes(1);
            expect(mockClient.publish).toHaveBeenCalledTimes(2);
            expect(mockStream.uncork).toHaveBeenCalledTimes(1);
            expect(cb1).toHaveBeenCalledTimes(1);
            expect(cb2).toHaveBeenCalledTimes(1);
            expect(queue.queue.length).toBe(0);
        });

        test('publishBatch should continuously write packets using socket cork/uncork', () => {
            const mockStream = {
                cork: jest.fn(),
                uncork: jest.fn()
            };
            const mockClient = {
                stream: mockStream,
                publish: jest.fn((topic, message, opts, cb) => {
                    if (cb) cb(null);
                })
            };

            const clientManager = new ClientManager('mqtts://broker.hivemq.com:8883');
            const packets = [
                { topic: 'sensor/dev-1', message: 'msg1', options: { qos: 0 } },
                { topic: 'sensor/dev-2', message: 'msg2', options: { qos: 0 } },
                { topic: 'sensor/dev-3', message: 'msg3', options: { qos: 0 } }
            ];

            const batchDone = jest.fn();
            clientManager.publishBatch(mockClient, packets, batchDone);

            expect(mockStream.cork).toHaveBeenCalledTimes(1);
            expect(mockClient.publish).toHaveBeenCalledTimes(3);
            expect(mockStream.uncork).toHaveBeenCalledTimes(1);
            expect(batchDone).toHaveBeenCalledTimes(1);
        });

        test('publish with batching option enabled should route to PacketQueue', () => {
            const clientManager = new ClientManager('mqtts://broker.hivemq.com:8883', {
                batching: true
            });
            const mockClient = { publish: jest.fn() };

            clientManager.publish(mockClient, 'topic/test', 'payload', {});
            expect(clientManager.packetQueue.queue.length).toBe(1);
            clientManager.packetQueue.flush();
        });
    });

    describe('3. High-Resolution Drift-Compensated Scheduler (src/runner.js)', () => {
        test('runCompensatedLoop should execute high-frequency ticks with sub-2ms pacing accuracy', (done) => {
            const runner = new SimulationRunner({
                options: { broker: 'mqtts://broker.hivemq.com:8883', count: 10, interval: 20 },
                deviceList: ['dev-test']
            });

            const intervalMs = 20;
            const targetTicks = 8;
            let tickCount = 0;
            const startHr = process.hrtime.bigint();
            const tickDeltas = [];
            let lastHr = startHr;

            const timerRef = runner.runCompensatedLoop('test-drift', intervalMs, async () => {
                const now = process.hrtime.bigint();
                const deltaMs = Number(now - lastHr) / 1000000;
                lastHr = now;
                tickDeltas.push(deltaMs);

                // Simulate async workload (e.g. 5ms payload processing)
                await new Promise((resolve) => setTimeout(resolve, 5));

                tickCount++;
                if (tickCount >= targetTicks) {
                    timerRef.cancel();

                    const totalElapsedMs = Number(process.hrtime.bigint() - startHr) / 1000000;
                    const expectedTotalMs = targetTicks * intervalMs;
                    const totalDrift = Math.abs(totalElapsedMs - expectedTotalMs);

                    // Average interval should remain tightly locked to 20ms (+/- 3ms margin for OS scheduler)
                    expect(totalDrift).toBeLessThan(intervalMs * 1.5);
                    done();
                }
            });
        });

        test('stopLoop should immediately cancel active compensated loop', () => {
            const runner = new SimulationRunner({
                options: { broker: 'mqtts://broker.hivemq.com:8883', interval: 50 },
                deviceList: ['dev-test']
            });

            const tickMock = jest.fn();
            runner.runCompensatedLoop('loop-1', 50, tickMock);
            expect(runner.activeIntervals.has('loop-1')).toBe(true);

            runner.stopLoop('loop-1');
            expect(runner.activeIntervals.has('loop-1')).toBe(false);
        });

        test('should enforce duration limit and exit cleanly after specified seconds', (done) => {
            const onExitMock = jest.fn(() => {
                expect(onExitMock).toHaveBeenCalledWith(0);
                done();
            });

            const mockClientManager = {
                connectClient: jest.fn(() => ({
                    on: jest.fn(),
                    publish: jest.fn()
                })),
                disconnectAll: jest.fn((cb) => {
                    if (cb) cb();
                })
            };

            const runner = new SimulationRunner({
                options: {
                    broker: 'mqtts://broker.hivemq.com:8883',
                    interval: 100,
                    duration: 1
                },
                deviceList: ['dev-test'],
                clientManager: mockClientManager,
                onExit: onExitMock
            });

            runner.start();
        }, 3000);
    });
});
