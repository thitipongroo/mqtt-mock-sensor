// @ts-check
'use strict';

const {
    generatePayload,
    sanitizeObject,
    isDangerousKey,
    safeJsonParse
} = require('./payloadGenerator');
const {
    SimulationRunner,
    PreGeneratedPayloadBuffer,
    ScenarioRunner,
    printCta
} = require('./runner');
const {
    ClientManager,
    PacketQueue,
    validateBrokerUrl,
    isLoopbackOrLinkLocal
} = require('./clientManager');
const { DriftCompensatedPacer } = require('./scheduler/pacer');
const { CsvReplayer } = require('./csvReplayer');
const { ShadowManager } = require('./shadowManager');
const { enrollDevice } = require('./enrollmentHelper');
const { runWizard } = require('./wizardHelper');
const { validateScenario, loadScenarioFile } = require('./cli/validator');

module.exports = {
    generatePayload,
    SimulationRunner,
    PreGeneratedPayloadBuffer,
    DriftCompensatedPacer,
    ScenarioRunner,
    ClientManager,
    PacketQueue,
    CsvReplayer,
    ShadowManager,
    enrollDevice,
    runWizard,
    printCta,
    validateBrokerUrl,
    isLoopbackOrLinkLocal,
    sanitizeObject,
    isDangerousKey,
    safeJsonParse,
    validateScenario,
    loadScenarioFile
};
