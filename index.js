#!/usr/bin/env node
// @ts-check
'use strict';

const { enrollDevice } = require('./src/enrollmentHelper');
const { CsvReplayer } = require('./src/csvReplayer');
const { runWizard } = require('./src/wizardHelper');
const {
    ClientManager,
    PacketQueue,
    validateBrokerUrl,
    isLoopbackOrLinkLocal
} = require('./src/clientManager');
const {
    SimulationRunner,
    PreGeneratedPayloadBuffer,
    ScenarioRunner,
    printCta
} = require('./src/runner');
const {
    generatePayload,
    sanitizeObject,
    isDangerousKey,
    safeJsonParse
} = require('./src/payloadGenerator');
const { ShadowManager } = require('./src/shadowManager');
const { program, buildCliProgram } = require('./src/cli/options');
const {
    validateCliOptions,
    loadTemplateFile,
    validateScenario,
    loadScenarioFile
} = require('./src/cli/validator');
const { launchWebStudio } = require('./src/cli/uiLauncher');

buildCliProgram();

/**
 * Main application coordinator.
 * @param {Record<string, any>} [customOptions]
 * @returns {Promise<SimulationRunner|void>}
 */
async function main(customOptions) {
    const cliProgram = /** @type {any} */ (program);
    if (!customOptions && (!cliProgram.rawArgs || cliProgram.rawArgs.length === 0)) {
        program.parse(process.argv);
    }
    const options = customOptions ? { ...program.opts(), ...customOptions } : program.opts();
    if (options.ui) {
        launchWebStudio();
        return;
    }

    const isInteractive = process.argv.slice(2).length === 0 && process.stdin.isTTY;
    if (isInteractive) {
        const wizardAnswers = await runWizard();
        options.type = wizardAnswers.type;
        if (wizardAnswers.preset) options.preset = wizardAnswers.preset;
        options.broker = wizardAnswers.broker;
        options.devices = wizardAnswers.devices;
        try {
            const parsed = new URL(options.broker);
            if (isLoopbackOrLinkLocal(parsed.hostname)) {
                options.allowLocal = true;
            }
        } catch {
            // URL parse errors handled by validator
        }
    }

    const effectiveSchemaVersion = validateCliOptions(options);
    const customTemplate = loadTemplateFile(options.template);
    const scenario = loadScenarioFile(options.scenario);

    let targetTopicTemplate = options.topic;
    if (!targetTopicTemplate) {
        targetTopicTemplate = options.orgId
            ? `orgs/${options.orgId}/devices/{deviceId}/telemetry`
            : 'sensor/mock/data';
    }

    let csvReplayer = null;
    if (options.replay) {
        try {
            csvReplayer = new CsvReplayer(options.replay, {
                loop: options.replayLoop !== false
            });
        } catch (err) {
            console.error(`❌ Failed to read CSV replay file: ${err.message}`);
            process.exit(1);
        }
    }

    const deviceList = Array.from({ length: options.devices }, (_, index) => {
        return options.deviceId && options.devices === 1
            ? options.deviceId
            : `mock-device-${String(index + 1).padStart(3, '0')}`;
    });

    if (options.dryRun) {
        executeDryRun({
            options,
            scenario,
            deviceList,
            effectiveSchemaVersion,
            customTemplate
        });
        return;
    }

    let runtimeUsername = options.username;
    let runtimePassword = options.password;

    if (options.enrollUrl && options.enrollToken) {
        try {
            const primaryDevId = deviceList[0];
            const credentials = await enrollDevice(
                options.enrollUrl,
                primaryDevId,
                options.enrollToken
            );
            runtimeUsername = credentials.username;
            runtimePassword = credentials.password;
        } catch (err) {
            console.error(`❌ Enrollment failed: ${err.message}`);
            process.exit(1);
        }
    }

    const clientManager = new ClientManager(options.broker, {
        ...options,
        runtimeUsername,
        runtimePassword
    });

    const runner = new SimulationRunner({
        options,
        deviceList,
        targetTopicTemplate,
        effectiveSchemaVersion,
        customTemplate,
        csvReplayer,
        clientManager,
        scenario
    });

    runner.start();
    return runner;
}

/**
 * Executes a dry-run validation and scenario timeline preview without connecting to broker.
 * @param {Object} params
 * @param {Record<string, any>} params.options
 * @param {any} [params.scenario]
 * @param {string[]} params.deviceList
 * @param {number} params.effectiveSchemaVersion
 * @param {string|null} params.customTemplate
 */
function executeDryRun({ options, scenario, deviceList, effectiveSchemaVersion, customTemplate }) {
    printCta();
    console.log();
    console.log('🔍 [DRY-RUN] Validating simulation configuration and execution plan...');
    console.log(
        `🔌 Devices: ${deviceList.length} (${deviceList.slice(0, 3).join(', ')}${deviceList.length > 3 ? '...' : ''})`
    );
    console.log(
        `📋 Telemetry Schema: v${effectiveSchemaVersion} | Preset/Type: "${options.preset || options.type}"`
    );

    if (scenario) {
        const {
            renderProgressBar,
            renderPhaseIndicator,
            normalizeAnomalyRate,
            inferAnomalyType
        } = require('./src/runner/scenarioRunner');
        const totalSec = scenario.phases.reduce(
            (/** @type {number} */ acc, /** @type {any} */ p) => acc + (p.durationSec || 0),
            0
        );
        console.log(`\n🎬 Scenario: "${scenario.name}" (v${scenario.version})`);
        console.log(`⏱️ Total Duration: ${totalSec}s across ${scenario.phases.length} phase(s)\n`);

        console.log('📋 Scenario Phase Breakdown:');
        scenario.phases.forEach((/** @type {any} */ phase, /** @type {number} */ idx) => {
            console.log(`  ${renderPhaseIndicator(phase, idx, scenario.phases.length)}`);
        });

        console.log('\n📊 ASCII Timeline Preview:');
        let cumulativeSec = 0;
        scenario.phases.forEach((/** @type {any} */ phase, /** @type {number} */ idx) => {
            const bar = renderProgressBar(cumulativeSec, totalSec, 20);
            const status = phase.status || `Phase ${idx + 1}`;
            console.log(
                `  T+${String(cumulativeSec).padStart(3, '0')}s ${bar} | Phase ${idx + 1}: ${status} (${phase.durationSec}s)`
            );
            cumulativeSec += phase.durationSec;
        });
        const finalBar = renderProgressBar(totalSec, totalSec, 20);
        console.log(`  T+${String(totalSec).padStart(3, '0')}s ${finalBar} | Drill Complete\n`);

        console.log('📤 Simulated Sample Payloads per Phase:');
        scenario.phases.forEach((/** @type {any} */ phase, /** @type {number} */ idx) => {
            if (phase.dropSockets) {
                console.log(
                    `  [Phase ${idx + 1}: ${phase.status || 'BLACKOUT'}] -> ⚡ [Sockets dropped - 0 packets published]`
                );
            } else {
                const phaseRate = normalizeAnomalyRate(phase.anomalyRate);
                const phaseType = inferAnomalyType(phase.status, phase.anomalyType);
                const samplePayload = generatePayload(options.preset || options.type, {
                    deviceId: deviceList[0] || 'mock-device-001',
                    schemaVersion: effectiveSchemaVersion,
                    preset: options.preset,
                    anomalyRate: phaseRate > 0 ? 100 : 0,
                    anomalyType: phaseType,
                    template: customTemplate,
                    orgId: options.orgId,
                    epochTimestamp: options.epochTimestamp
                });
                console.log(
                    `  [Phase ${idx + 1}: ${phase.status || 'SAMPLE'}] -> ${samplePayload}`
                );
            }
        });

        console.log(
            `\n✅ [DRY RUN] Scenario "${scenario.name}" verified successfully. All ${scenario.phases.length} phases valid.`
        );
        console.log('⚡ 0 network packets transmitted. Safe for local CI/Dev verification.\n');
    } else {
        const samplePayload = generatePayload(options.preset || options.type, {
            deviceId: deviceList[0] || 'mock-device-001',
            schemaVersion: effectiveSchemaVersion,
            preset: options.preset,
            template: customTemplate,
            orgId: options.orgId,
            epochTimestamp: options.epochTimestamp
        });
        console.log(`\n📤 Sample Payload: ${samplePayload}`);
        console.log(
            '\n✅ [DRY RUN] Configuration validated successfully. 0 network packets transmitted.\n'
        );
    }
}

if (require.main === module) {
    program.parse(process.argv);
    main().catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = {
    main,
    program,
    printCta,
    generatePayload,
    SimulationRunner,
    PreGeneratedPayloadBuffer,
    ScenarioRunner,
    ClientManager,
    PacketQueue,
    CsvReplayer,
    ShadowManager,
    enrollDevice,
    runWizard,
    validateBrokerUrl,
    isLoopbackOrLinkLocal,
    sanitizeObject,
    isDangerousKey,
    safeJsonParse,
    validateScenario,
    loadScenarioFile
};
