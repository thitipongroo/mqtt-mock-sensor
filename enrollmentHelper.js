/**
 * enrollmentHelper.js
 * Enroll Device via REST API
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

async function enrollDevice(enrollUrl, deviceId, token) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(enrollUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const clientLib = isHttps ? https : http;

        const postData = JSON.stringify({
            deviceId: deviceId,
            token: token
        });

        const reqOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 5000
        };

        console.log(
            `🔑 Requesting dynamic enrollment from ${enrollUrl} for device "${deviceId}"...`
        );

        const req = clientLib.request(reqOptions, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    let password = body.trim();
                    try {
                        const parsed = JSON.parse(body);
                        if (parsed.password) password = parsed.password;
                    } catch {
                        // Response plain text password
                    }
                    console.log(`✅ Enrollment successful! MQTT credentials acquired.`);
                    resolve({ username: deviceId, password });
                } else {
                    reject(new Error(`Enrollment failed with status ${res.statusCode}: ${body}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Enrollment request timed out after 5000ms'));
        });

        req.write(postData);
        req.end();
    });
}

module.exports = { enrollDevice };
