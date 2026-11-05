import { Command } from 'commander';
import { MqttClient } from 'mqtt';
import { EventEmitter } from 'events';

export interface ScenarioPhase {
    durationSec: number;
    intervalMs?: number;
    anomalyRate?: number;
    anomalyType?: string;
    status?: string;
    dropSockets?: boolean;
}

export interface ScenarioConfig {
    name: string;
    version: number;
    phases: ScenarioPhase[];
}

export interface RunnerConfig {
    options?: Record<string, any>;
    deviceList?: string[];
    targetTopicTemplate?: string;
    effectiveSchemaVersion?: number;
    customTemplate?: string | null;
    csvReplayer?: CsvReplayer | null;
    clientManager?: ClientManager;
    onExit?: ((code: number) => void) | null;
    scenario?: ScenarioConfig | null;
}

export class SimulationRunner {
    constructor(config?: RunnerConfig);
    options: Record<string, any>;
    deviceList: string[];
    targetTopicTemplate: string;
    effectiveSchemaVersion: number;
    customTemplate: string | null;
    csvReplayer: CsvReplayer | null;
    clientManager: ClientManager;
    onExit: ((code: number) => void) | null;
    scenario: ScenarioConfig | null;
    scenarioRunner: ScenarioRunner | null;
    socketsDropped: boolean;
    activeIntervals: Map<string, DriftCompensatedPacer>;
    activeTimeouts: Set<NodeJS.Timeout>;
    publishedCounts: Map<string, number>;
    activeWaiters: Set<() => void>;
    isShuttingDown: boolean;

    waitDelay(ms: number): Promise<void>;
    buildPayload(devId: string): string;
    runCompensatedLoop(
        key: string,
        intervalMs: number,
        tickFn: () => Promise<void> | void
    ): DriftCompensatedPacer;
    stopLoop(key: string): void;
    checkExitCondition(): void;
    shutdownAndExit(code?: number): void;
    stop(): Promise<void>;
    start(): void;
    startIndependentFleet(): void;
    startPooledSimulation(): void;
    startDeviceLoop(devId: string, client: any, intervalMs: number): void;
    restartDeviceLoop(devId: string, client: any, newIntervalMs: number): void;
    updateInterval(newIntervalMs: number): void;
    updateAnomaly(rate?: number, type?: string): void;
    dropSockets(): void;
    reconnectSockets(): void;
}

export class ScenarioRunner extends EventEmitter {
    constructor(scenario: ScenarioConfig, runner?: any, options?: Record<string, any>);
    scenario: ScenarioConfig;
    runner: any;
    options: Record<string, any>;
    phases: ScenarioPhase[];
    totalDurationSec: number;
    currentPhaseIndex: number;
    phaseElapsedSec: number;
    totalElapsedSec: number;
    isRunning: boolean;
    isFinished: boolean;
    timelinePacer: DriftCompensatedPacer | null;

    getCurrentPhase(): ScenarioPhase | null;
    getPhases(): ScenarioPhase[];
    getTotalDuration(): number;
    start(): void;
    applyPhase(index: number): void;
    tick(): void;
    finish(): void;
    stop(): void;
}

export function renderProgressBar(current: number, total: number, barWidth?: number): string;
export function renderPhaseIndicator(phase: any, index: number, totalPhases: number): string;
export function validateScenario(scenario: any): ScenarioConfig;
export function loadScenarioFile(scenarioPath?: string, options?: { exitOnError?: boolean }): ScenarioConfig | null;

export class DriftCompensatedPacer {
    constructor(intervalMs: number, tickFn: () => Promise<void> | void);
    intervalMs: number;
    tickFn: () => Promise<void> | void;
    isRunning: boolean;
    accumulatedDriftMs: number;
    start(): void;
    cancel(): void;
    getMetrics(): {
        executedTicks: number;
        meanIntervalMs: number;
        varianceMs: number;
        totalDriftMs: number;
        maxJitterMs: number;
    };
}

export interface PayloadBufferConfig {
    deviceList: string[];
    type?: string;
    options?: Record<string, any>;
    customTemplate?: string | null;
    csvReplayer?: CsvReplayer | null;
    bufferSize?: number;
}

export class PreGeneratedPayloadBuffer {
    constructor(config: PayloadBufferConfig);
    getPayload(devId: string): string;
}

export interface ClientManagerOptions {
    ca?: string;
    cert?: string;
    key?: string;
    insecure?: boolean;
    runtimeUsername?: string;
    runtimePassword?: string;
    username?: string;
    password?: string;
    willTopic?: string;
    willMessage?: string;
    willQos?: number;
    willRetain?: boolean;
    allowLocal?: boolean;
    [key: string]: any;
}

export class PacketQueue {
    constructor(client: MqttClient);
    push(packet: { topic: string; message: string; options: any }): void;
    flush(): void;
}

export class ClientManager {
    constructor(brokerUrl: string, options?: ClientManagerOptions);
    brokerUrl: string;
    options: ClientManagerOptions;
    clients: Map<string, MqttClient>;
    packetQueues: Map<string, PacketQueue>;

    connectClient(devId: string, isPooled?: boolean): MqttClient;
    publishBuffered(devId: string, topic: string, message: string, publishOptions?: any): void;
    flushClient(devId: string): void;
    disconnectAll(callback?: () => void): void;
}

export class CsvReplayer {
    constructor(filePathOrContent: string, options?: Record<string, any>);
    rows: Record<string, any>[];
    getRowCount(): number;
    hasMoreRows(devId?: string): boolean;
    getNextRow(devId?: string): Record<string, any> | null;
    getNextPayload(devId?: string): string | null;
    reset(devId?: string): void;
}

export class ShadowManager {
    constructor(
        client: any,
        orgId?: string | null,
        deviceId?: string,
        initialConfig?: Record<string, any>,
        onConfigChange?: ((delta: Record<string, any>) => void) | null
    );
    init(): void;
    publishReportedState(reportedPatch: Record<string, any>, clientToken?: string | null): void;
    handleDelta(rawMessage: string): void;
}

export interface PayloadOptions {
    deviceId?: string;
    template?: string | null;
    preset?: string;
    anomalyRate?: number;
    anomalyType?: string;
    schemaVersion?: number;
    orgId?: string;
    epochTimestamp?: boolean;
}

export function generatePayload(type?: string, options?: PayloadOptions): string;
export function sanitizeObject<T>(input: T): T;
export function isDangerousKey(key: string): boolean;
export function safeJsonParse(jsonString: string): any;

export function validateBrokerUrl(rawUrl: string, allowLocal?: boolean): void;
export function isLoopbackOrLinkLocal(hostname: string): boolean;

export function enrollDevice(
    enrollUrl: string,
    deviceId: string,
    token: string
): Promise<{ username: string; password: string }>;

export function runWizard(
    inputStream?: any,
    outputStream?: any
): Promise<{ type: string; preset: string | null; broker: string; devices: number }>;

export function printCta(): void;

export function main(customOptions?: Record<string, any>): Promise<SimulationRunner | void>;
export const program: Command;
