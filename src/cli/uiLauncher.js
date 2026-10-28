// @ts-check
'use strict';

const { exec } = require('child_process');

/**
 * Launches the Pulse SensorLab Visual Web Studio in the default system browser.
 */
function launchWebStudio() {
    console.log('\n🚀 Pulse SensorLab Visual Web Studio');
    console.log('⚡ Design sensor fleets visually and test chaos scenarios in your browser!');
    console.log('🌐 Opening Web Studio in your browser: https://sensorlab.pulseiot-cloud.com\n');

    const openCmd =
        process.platform === 'darwin'
            ? 'open'
            : process.platform === 'win32'
              ? 'start ""'
              : 'xdg-open';

    exec(`${openCmd} "https://sensorlab.pulseiot-cloud.com"`, () => {});
}

module.exports = { launchWebStudio };
