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
const { SimulationRunner, PreGeneratedPayloadBuffer, printCta } = require('./src/runner');
const {
    generatePayload,
    sanitizeObject,
    isDangerousKey,
    safeJsonParse
} = require('./src/payloadGenerator');
const { ShadowManager } = require('./src/shadowManager');
const { program, buildCliProgram } = require('./src/cli/options');
const { validateCliOptions, loadTemplateFile } = require('./src/cli/validator');
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
        clientManager
    });

    runner.start();
    return runner;
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
    safeJsonParse
};
