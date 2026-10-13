const { enrollDevice } = require('./enrollmentHelper');
const http = require('http');
const EventEmitter = require('events');

jest.mock('http');

describe('enrollmentHelper - Test Suite', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = new EventEmitter();
        mockReq.write = jest.fn();
        mockReq.end = jest.fn();
        mockReq.destroy = jest.fn();

        mockRes = new EventEmitter();
        mockRes.statusCode = 200;

        http.request = jest.fn((options, callback) => {
            if (callback) callback(mockRes);
            return mockReq;
        });
    });

    test('should resolve credentials when Sentinel API returns plain-text password', async () => {
        const enrollPromise = enrollDevice(
            'http://localhost:8080/api/v1/devices/enroll',
            'sensor-01',
            'token-123'
        );

        mockRes.emit('data', 'raw-super-secret-password-xyz');
        mockRes.emit('end');

        const result = await enrollPromise;
        expect(result).toEqual({
            username: 'sensor-01',
            password: 'raw-super-secret-password-xyz'
        });
    });

    test('should resolve credentials when Sentinel API returns JSON response', async () => {
        const enrollPromise = enrollDevice(
            'http://localhost:8080/api/v1/devices/enroll',
            'sensor-02',
            'token-456'
        );

        mockRes.emit('data', JSON.stringify({ password: 'json-secret-password-999' }));
        mockRes.emit('end');

        const result = await enrollPromise;
        expect(result).toEqual({
            username: 'sensor-02',
            password: 'json-secret-password-999'
        });
    });

    test('should reject when Sentinel API returns non-200 status code', async () => {
        mockRes.statusCode = 403;
        const enrollPromise = enrollDevice(
            'http://localhost:8080/api/v1/devices/enroll',
            'sensor-03',
            'bad-token'
        );

        mockRes.emit('data', 'Invalid or expired token');
        mockRes.emit('end');

        await expect(enrollPromise).rejects.toThrow('Enrollment failed with status 403');
    });

    test('should reject on request network error', async () => {
        const enrollPromise = enrollDevice(
            'http://localhost:8080/api/v1/devices/enroll',
            'sensor-04',
            'token-123'
        );

        mockReq.emit('error', new Error('ECONNREFUSED'));

        await expect(enrollPromise).rejects.toThrow('ECONNREFUSED');
    });
});
