const path = require('path');
const fs = require('fs');
const {
    ScenarioRunner,
    renderProgressBar,
    renderPhaseIndicator,
    normalizeAnomalyRate,
    inferAnomalyType
} = require('../src/runner/scenarioRunner');
const { validateScenario, loadScenarioFile } = require('../src/cli/validator');
const { SimulationRunner } = require('../src/runner');
const rootModule = require('../index');
const srcModule = require('../src/index');

describe('Scenario JSON Execution & CLI Integration Test Suite (Track A)', () => {
    const drillFilePath = path.join(__dirname, '../examples/scenario-drill.json');

    describe('1. Scenario JSON Loading, Parsing & Validation', () => {
        test('should load and validate examples/scenario-drill.json successfully', () => {
            const scenario = loadScenarioFile(drillFilePath, { exitOnError: false });
            expect(scenario).toBeDefined();
            expect(scenario.name).toBe('Factory Anomaly Drill');
            expect(scenario.version).toBe(1);
            expect(Array.isArray(scenario.phases)).toBe(true);
            expect(scenario.phases.length).toBe(3);

            // Phase 1
            expect(scenario.phases[0].durationSec).toBe(10);
            expect(scenario.phases[0].intervalMs).toBe(1000);
            expect(scenario.phases[0].anomalyRate).toBe(0.0);
            expect(scenario.phases[0].status).toBe('NORMAL');

            // Phase 2
            expect(scenario.phases[1].durationSec).toBe(15);
            expect(scenario.phases[1].intervalMs).toBe(500);
            expect(scenario.phases[1].anomalyRate).toBe(0.6);
            expect(scenario.phases[1].status).toBe('OVERHEAT_SPIKE');

            // Phase 3
            expect(scenario.phases[2].durationSec).toBe(5);
            expect(scenario.phases[2].dropSockets).toBe(true);
            expect(scenario.phases[2].status).toBe('NETWORK_BLACKOUT');
        });

        test('should return null when no scenario path is specified', () => {
            expect(loadScenarioFile(undefined)).toBeNull();
            expect(loadScenarioFile('')).toBeNull();
        });

        test('should throw error when scenario file does not exist', () => {
            expect(() => {
                loadScenarioFile('non-existent-scenario.json', { exitOnError: false });
            }).toThrow(/Failed to read scenario file/);
        });

        test('should throw error when scenario file contains invalid JSON', () => {
            const tmpFile = path.join(__dirname, 'temp-invalid.json');
            fs.writeFileSync(tmpFile, '{ "invalid": json syntax }', 'utf-8');
            try {
                expect(() => {
                    loadScenarioFile(tmpFile, { exitOnError: false });
                }).toThrow(/Invalid JSON in scenario file/);
            } finally {
                if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            }
        });

        test('validateScenario should reject non-object or invalid root fields', () => {
            expect(() => validateScenario(null)).toThrow(/valid JSON object/);
            expect(() => validateScenario('string')).toThrow(/valid JSON object/);
            expect(() => validateScenario({ version: 1, phases: [] })).toThrow(
                /name.*non-empty string/
            );
            expect(() => validateScenario({ name: 'Drill', phases: [] })).toThrow(
                /version.*number/
            );
            expect(() => validateScenario({ name: 'Drill', version: 1, phases: [] })).toThrow(
                /phases.*non-empty array/
            );
        });

        test('validateScenario should validate phase field constraints', () => {
            expect(() =>
                validateScenario({
                    name: 'Test',
                    version: 1,
                    phases: [{ durationSec: -5 }]
                })
            ).toThrow(/durationSec.*positive number/);

            expect(() =>
                validateScenario({
                    name: 'Test',
                    version: 1,
                    phases: [{ durationSec: 10, intervalMs: 0 }]
                })
            ).toThrow(/intervalMs.*positive number/);

            expect(() =>
                validateScenario({
                    name: 'Test',
                    version: 1,
                    phases: [{ durationSec: 10, anomalyRate: -1 }]
                })
            ).toThrow(/anomalyRate.*non-negative number/);

            expect(() =>
                validateScenario({
                    name: 'Test',
                    version: 1,
                    phases: [{ durationSec: 10, anomalyType: 'invalid-type' }]
                })
            ).toThrow(/Invalid "anomalyType"/);
        });

        test('normalizeAnomalyRate should handle fractions, percentages, and boundary cases', () => {
            expect(normalizeAnomalyRate(0.0)).toBe(0);
            expect(normalizeAnomalyRate(0.6)).toBe(60);
            expect(normalizeAnomalyRate(1.0)).toBe(100);
            expect(normalizeAnomalyRate(15)).toBe(15);
            expect(normalizeAnomalyRate(100)).toBe(100);
            expect(normalizeAnomalyRate(-5)).toBe(0);
            expect(normalizeAnomalyRate(null)).toBe(0);
            expect(normalizeAnomalyRate(undefined)).toBe(0);
        });

        test('inferAnomalyType should correctly categorize phase status labels', () => {
            expect(inferAnomalyType('NORMAL')).toBe('critical');
            expect(inferAnomalyType('OVERHEAT_SPIKE')).toBe('critical');
            expect(inferAnomalyType('VOLTAGE_WARNING')).toBe('warning');
            expect(inferAnomalyType('DEGRADED_QUALITY')).toBe('quality');
            expect(inferAnomalyType('OUT_OF_BOUNDS')).toBe('out-of-bounds');
            // Explicit override
            expect(inferAnomalyType('NORMAL', 'warning')).toBe('warning');
        });
    });

    describe('2. Terminal ASCII Progress Bar & Phase Indicator Rendering', () => {
        test('renderProgressBar should produce valid ASCII block representations', () => {
            const bar0 = renderProgressBar(0, 100, 20);
            expect(bar0).toBe('[░░░░░░░░░░░░░░░░░░░░]   0%');

            const bar50 = renderProgressBar(50, 100, 20);
            expect(bar50).toBe('[██████████░░░░░░░░░░]  50%');

            const bar100 = renderProgressBar(100, 100, 20);
            expect(bar100).toBe('[████████████████████] 100%');

            const barOverflow = renderProgressBar(120, 100, 20);
            expect(barOverflow).toBe('[████████████████████] 100%');

            const barZeroTotal = renderProgressBar(10, 0, 20);
            expect(barZeroTotal).toBe('[░░░░░░░░░░░░░░░░░░░░]   0%');
        });

        test('renderPhaseIndicator should format phase parameters clearly', () => {
            const p1 = {
                durationSec: 10,
                intervalMs: 1000,
                anomalyRate: 0.0,
                status: 'NORMAL'
            };
            const ind1 = renderPhaseIndicator(p1, 0, 3);
            expect(ind1).toContain('Phase 1/3');
            expect(ind1).toContain('NORMAL');
            expect(ind1).toContain('10s');
            expect(ind1).toContain('1000ms');
            expect(ind1).toContain('0%');

            const p3 = {
                durationSec: 5,
                dropSockets: true,
                status: 'NETWORK_BLACKOUT'
            };
            const ind3 = renderPhaseIndicator(p3, 2, 3);
            expect(ind3).toContain('Phase 3/3');
            expect(ind3).toContain('NETWORK_BLACKOUT');
            expect(ind3).toContain('⚡ Sockets: DROPPED');
        });
    });

    describe('3. Timeline Management & Phase Transitions over Time', () => {
        test('should track phases and total duration properly', () => {
            const scenario = {
                name: 'Test Drill',
                version: 1,
                phases: [
                    { durationSec: 5, intervalMs: 1000, status: 'P1' },
                    { durationSec: 10, intervalMs: 500, status: 'P2' }
                ]
            };

            const runner = new ScenarioRunner(scenario, null, { silent: true });
            expect(runner.getTotalDuration()).toBe(15);
            expect(runner.getPhases().length).toBe(2);
            expect(runner.getCurrentPhase()).toBe(scenario.phases[0]);
        });

        test('applyPhase should transition phases and emit phaseChange event', () => {
            const scenario = {
                name: 'Manual Step Drill',
                version: 1,
                phases: [
                    { durationSec: 10, intervalMs: 1000, status: 'NORMAL' },
                    { durationSec: 15, intervalMs: 500, status: 'SPIKE' }
                ]
            };

            const runner = new ScenarioRunner(scenario, null, { silent: true });
            const phaseChangeSpy = jest.fn();
            runner.on('phaseChange', phaseChangeSpy);

            runner.applyPhase(0);
            expect(runner.currentPhaseIndex).toBe(0);
            expect(phaseChangeSpy).toHaveBeenCalledWith(scenario.phases[0], 0, 2);

            runner.applyPhase(1);
            expect(runner.currentPhaseIndex).toBe(1);
            expect(phaseChangeSpy).toHaveBeenCalledWith(scenario.phases[1], 1, 2);
        });

        test('should execute full timeline with accelerated timeScale and emit finish', (done) => {
            const scenario = {
                name: 'Fast Timeline Drill',
                version: 1,
                phases: [
                    { durationSec: 1, intervalMs: 500, status: 'PHASE_A' },
                    { durationSec: 1, intervalMs: 250, status: 'PHASE_B' }
                ]
            };

            const visitedPhases = [];
            const runner = new ScenarioRunner(scenario, null, {
                silent: true,
                timeScale: 50 // Accelerate timeline: 1 sec scenario = 20ms real
            });

            runner.on('phaseChange', (phase) => {
                visitedPhases.push(phase.status);
            });

            runner.on('finish', () => {
                expect(visitedPhases).toEqual(['PHASE_A', 'PHASE_B']);
                expect(runner.isRunning).toBe(false);
                expect(runner.isFinished).toBe(true);
                runner.stop();
                done();
            });

            runner.start();
        }, 3000);

        test('stop should cancel active timeline pacer and stop execution', () => {
            const scenario = {
                name: 'Stop Test',
                version: 1,
                phases: [{ durationSec: 10, intervalMs: 1000, status: 'RUNNING' }]
            };

            const runner = new ScenarioRunner(scenario, null, { silent: true });
            runner.start();
            expect(runner.isRunning).toBe(true);
            expect(runner.timelinePacer).not.toBeNull();

            runner.stop();
            expect(runner.isRunning).toBe(false);
            expect(runner.timelinePacer).toBeNull();
        });
    });

    describe('4. Dynamic Config Updates to SimulationRunner', () => {
        test('should adjust pacing interval, anomaly rate, and sockets on mock runner', () => {
            const mockRunner = {
                updateInterval: jest.fn(),
                updateAnomaly: jest.fn(),
                dropSockets: jest.fn(),
                reconnectSockets: jest.fn(),
                shutdownAndExit: jest.fn(),
                socketsDropped: false
            };

            const scenario = {
                name: 'Multi-Phase Drill',
                version: 1,
                phases: [
                    { durationSec: 10, intervalMs: 1000, anomalyRate: 0.0, status: 'NORMAL' },
                    {
                        durationSec: 15,
                        intervalMs: 500,
                        anomalyRate: 0.6,
                        status: 'OVERHEAT_SPIKE'
                    },
                    { durationSec: 5, dropSockets: true, status: 'NETWORK_BLACKOUT' }
                ]
            };

            const scenarioRunner = new ScenarioRunner(scenario, mockRunner, { silent: true });

            // Apply Phase 0
            scenarioRunner.applyPhase(0);
            expect(mockRunner.updateInterval).toHaveBeenCalledWith(1000);
            expect(mockRunner.updateAnomaly).toHaveBeenCalledWith(0.0, 'critical');

            // Apply Phase 1
            scenarioRunner.applyPhase(1);
            expect(mockRunner.updateInterval).toHaveBeenCalledWith(500);
            expect(mockRunner.updateAnomaly).toHaveBeenCalledWith(0.6, 'critical');

            // Apply Phase 2 (Blackout)
            scenarioRunner.applyPhase(2);
            expect(mockRunner.dropSockets).toHaveBeenCalledTimes(1);

            // Reconnecting scenario
            mockRunner.socketsDropped = true;
            scenarioRunner.phases.push({
                durationSec: 5,
                intervalMs: 1000,
                status: 'RECOVERED'
            });
            scenarioRunner.applyPhase(3);
            expect(mockRunner.reconnectSockets).toHaveBeenCalledTimes(1);
        });

        test('SimulationRunner updateInterval and updateAnomaly methods modify runtime state', () => {
            const runner = new SimulationRunner({
                options: {
                    broker: 'mqtts://broker.hivemq.com:8883',
                    interval: 2000,
                    anomalyRate: 0,
                    type: 'industrial'
                },
                deviceList: ['dev-test-1']
            });

            expect(runner.options.interval).toBe(2000);
            expect(runner.options.anomalyRate).toBe(0);

            // Dynamically change interval
            runner.updateInterval(500);
            expect(runner.options.interval).toBe(500);

            // Dynamically change anomaly rate (fractional 0.6 -> 60%)
            runner.updateAnomaly(0.6, 'critical');
            expect(runner.options.anomalyRate).toBe(60);
            expect(runner.options.anomalyType).toBe('critical');

            // Drop and reconnect sockets
            runner.dropSockets();
            expect(runner.socketsDropped).toBe(true);

            runner.reconnectSockets();
            expect(runner.socketsDropped).toBe(false);
        });

        test('SimulationRunner should instantiate ScenarioRunner when scenario is provided', () => {
            const scenario = {
                name: 'Integrated Drill',
                version: 1,
                phases: [{ durationSec: 10, intervalMs: 1000, status: 'NORMAL' }]
            };

            const mockClientManager = {
                connectClient: jest.fn(() => ({ on: jest.fn(), publish: jest.fn() })),
                disconnectAll: jest.fn((cb) => cb && cb()),
                activeClients: []
            };

            const onExit = jest.fn();
            const runner = new SimulationRunner({
                options: { broker: 'mqtts://broker.hivemq.com:8883' },
                deviceList: ['dev-01'],
                clientManager: mockClientManager,
                scenario,
                onExit
            });

            expect(runner.scenario).toBe(scenario);
            expect(runner.scenarioRunner).toBeNull();

            // Calling start will initialize scenarioRunner
            runner.start();
            expect(runner.scenarioRunner).toBeInstanceOf(ScenarioRunner);
            expect(runner.scenarioRunner.isRunning).toBe(true);

            // Clean up
            runner.shutdownAndExit(0);
            expect(onExit).toHaveBeenCalledWith(0);
        });
    });

    describe('5. Programmatic API Exports & Module Structure', () => {
        test('should export ScenarioRunner, validateScenario, loadScenarioFile in root and src modules', () => {
            expect(typeof rootModule.ScenarioRunner).toBe('function');
            expect(typeof rootModule.validateScenario).toBe('function');
            expect(typeof rootModule.loadScenarioFile).toBe('function');

            expect(typeof srcModule.ScenarioRunner).toBe('function');
            expect(typeof srcModule.validateScenario).toBe('function');
            expect(typeof srcModule.loadScenarioFile).toBe('function');
        });
    });
});
