// @ts-check
'use strict';

/**
 * Checks exit conditions for the simulation runner.
 * @param {any} runner
 */
function checkExitCondition(runner) {
    if (runner.csvReplayer && runner.options.replayLoop === false) {
        if (
            runner.deviceList.every((/** @type {string} */ d) => !runner.csvReplayer.hasMoreRows(d))
        ) {
            console.log(
                `\n✅ Replayed all ${runner.csvReplayer.getRowCount()} CSV row(s). Exiting.\n`
            );
            runner.shutdownAndExit(0);
            return;
        }
    }
    if (!runner.options.count) return;
    const allDone = runner.deviceList.every(
        (/** @type {string} */ d) => (runner.publishedCounts.get(d) || 0) >= runner.options.count
    );
    if (allDone) {
        console.log(`\n✅ Published ${runner.options.count} message(s) per device. Exiting.\n`);
        runner.shutdownAndExit(0);
    }
}

module.exports = { checkExitCondition };
