import { Command } from 'commander';
import { MqttClient } from 'mqtt';

export interface RunnerConfig {
    options?: Record<string, any>;
    deviceList?: string[];
    targetTopicTemplate?: string;
    effectiveSchemaVersion?: number;
    customTemplate?: string | null;
    csvReplayer?: CsvReplayer | null;
    clientManager?: ClientManager;
    onExit?: ((code: number) => void) | null;
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
    activeIntervals: Map<string, DriftCompensatedPacer>;
    activeTimeouts: Set<NodeJS.Timeout>;
    publishedCounts: Map<string, number>;
    isShuttingDown: boolean;

    waitDelay(ms: number): Promise<void>;
    buildPayload(devId: string): string;
    runCompensatedLoop(key: string, intervalMs: number, tickFn: () => Promise<void> | void): DriftCompensatedPacer;
    stopLoop(key: string): void;
    checkExitCondition(): void;
    shutdownAndExit(code?: number): void;
    stop(): Promise<void>;
    start(): void;
    startIndependentFleet(): void;
    startPooledSimulation(): void;
    startDeviceLoop(devId: string, client: any, intervalMs: number): void;
    restartDeviceLoop(devId: string, client: any, newIntervalMs: number): void;
}

export class DriftCompensatedPacer {
    constructor(intervalMs: number, tickFn: () => Promise<void> | void);
    intervalMs: number;
    tickFn: () => Promise<void> | void;
    isRunning: boolean;
    accumulatedDriftMs: number;
    start(): void;
    cancel(): void;
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
        orgId: string,
        deviceId: string,
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

