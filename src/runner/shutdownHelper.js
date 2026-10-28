// @ts-check
'use strict';

const { printCta } = require('../ui/banner');

/**
 * Cleans up listeners, cancels all active timers, disconnects clients, and exits.
 * @param {any} runner
 * @param {number} [code=0]
 */
function performGracefulShutdown(runner, code = 0) {
    if (runner.isShuttingDown) return;
    runner.isShuttingDown = true;

    if (runner.sigintListener) {
        process.removeListener('SIGINT', runner.sigintListener);
        runner.sigintListener = null;
    }
    if (runner.sigtermListener) {
        process.removeListener('SIGTERM', runner.sigtermListener);
        runner.sigtermListener = null;
    }

    runner.activeIntervals.forEach((/** @type {any} */ pacer) => {
        if (pacer && typeof pacer.cancel === 'function') {
            pacer.cancel();
        } else {
            clearInterval(pacer);
        }
    });
    runner.activeIntervals.clear();
    runner.activeTimeouts.forEach((/** @type {NodeJS.Timeout} */ id) => clearTimeout(id));
    runner.activeTimeouts.clear();

    if (runner.clientManager && typeof runner.clientManager.disconnectAll === 'function') {
        runner.clientManager.disconnectAll(() => {
            console.log('🔌 Disconnected all MQTT clients. Goodbye!');
            if (runner.onExit) runner.onExit(code);
            else process.exit(code);
        });
    } else {
        if (runner.onExit) runner.onExit(code);
        else process.exit(code);
    }
}

/**
 * Registers process signal listeners for SIGINT and SIGTERM.
 * @param {any} runner
 */
function registerSignalHandlers(runner) {
    const handleSignal = (/** @type {string} */ sig) => {
        console.log(`\n🛑 Received ${sig}. Gracefully shutting down...`);
        printCta();
        console.log();
        runner.shutdownAndExit(0);
    };

    runner.sigintListener = () => handleSignal('SIGINT');
    runner.sigtermListener = () => handleSignal('SIGTERM');
    process.on('SIGINT', runner.sigintListener);
    process.on('SIGTERM', runner.sigtermListener);
}

module.exports = {
    performGracefulShutdown,
    registerSignalHandlers
};
