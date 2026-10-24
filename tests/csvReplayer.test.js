const { CsvReplayer, parseCsvLine, castValue } = require('../src/csvReplayer');

describe('csvReplayer', () => {
    describe('parseCsvLine', () => {
        test('parses simple comma separated values', () => {
            expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
        });

        test('handles quoted values with commas inside', () => {
            expect(parseCsvLine('1,"hello, world",34.5')).toEqual(['1', 'hello, world', '34.5']);
        });

        test('handles single quotes and trims whitespace', () => {
            expect(parseCsvLine(" 'foo' , 'bar' ")).toEqual(['foo', 'bar']);
        });
    });

    describe('castValue', () => {
        test('casts numbers and floats', () => {
            expect(castValue('123')).toBe(123);
            expect(castValue('24.51')).toBe(24.51);
            expect(castValue('-10.2')).toBe(-10.2);
        });

        test('casts booleans and null', () => {
            expect(castValue('true')).toBe(true);
            expect(castValue('False')).toBe(false);
            expect(castValue('null')).toBe(null);
        });

        test('casts json strings', () => {
            expect(castValue('{"temp":25}')).toEqual({ temp: 25 });
            expect(castValue('[1,2,3]')).toEqual([1, 2, 3]);
        });

        test('retains plain strings', () => {
            expect(castValue('sensor-01')).toBe('sensor-01');
            expect(castValue('')).toBe('');
        });
    });

    describe('CsvReplayer Class', () => {
        const sampleCsv = `
            # Sample sensor log file
            temperature,humidity,voltage,status
            24.5,55.2,220.1,OPTIMAL
            25.1,54.8,220.4,OPTIMAL
            32.8,70.0,218.0,WARNING
        `;

        test('initializes and parses rows correctly', () => {
            const replayer = new CsvReplayer(sampleCsv, { isContent: true });
            expect(replayer.getRowCount()).toBe(3);
        });

        test('retrieves rows in sequence and injects deviceId and timestamp', () => {
            const replayer = new CsvReplayer(sampleCsv, { isContent: true, loop: false });

            const row1 = replayer.getNextRow('sensor-01');
            expect(row1.temperature).toBe(24.5);
            expect(row1.deviceId).toBe('sensor-01');
            expect(row1.status).toBe('OPTIMAL');
            expect(typeof row1.timestamp).toBe('string');

            const row2 = replayer.getNextRow('sensor-01');
            expect(row2.temperature).toBe(25.1);

            const row3 = replayer.getNextRow('sensor-01');
            expect(row3.temperature).toBe(32.8);
            expect(row3.status).toBe('WARNING');

            const row4 = replayer.getNextRow('sensor-01');
            expect(row4).toBeNull();
        });

        test('supports looping when loop: true', () => {
            const replayer = new CsvReplayer(sampleCsv, { isContent: true, loop: true });

            replayer.getNextRow('dev-1');
            replayer.getNextRow('dev-1');
            replayer.getNextRow('dev-1');

            // 4th read should loop back to 1st row
            const looped = replayer.getNextRow('dev-1');
            expect(looped.temperature).toBe(24.5);
        });

        test('maintains independent cursors per deviceId', () => {
            const replayer = new CsvReplayer(sampleCsv, { isContent: true });

            const dev1Row1 = replayer.getNextRow('dev-1');
            const dev2Row1 = replayer.getNextRow('dev-2');

            expect(dev1Row1.temperature).toBe(24.5);
            expect(dev2Row1.temperature).toBe(24.5);

            const dev1Row2 = replayer.getNextRow('dev-1');
            expect(dev1Row2.temperature).toBe(25.1);

            // dev-2 should still be at 2nd row on next call
            const dev2Row2 = replayer.getNextRow('dev-2');
            expect(dev2Row2.temperature).toBe(25.1);
        });

        test('getNextPayload returns valid JSON string', () => {
            const replayer = new CsvReplayer(sampleCsv, { isContent: true });
            const payloadStr = replayer.getNextPayload('dev-1');
            const parsed = JSON.parse(payloadStr);

            expect(parsed.deviceId).toBe('dev-1');
            expect(parsed.voltage).toBe(220.1);
        });

        test('throws error if CSV has fewer than 2 rows', () => {
            expect(() => {
                new CsvReplayer('headerOnly', { isContent: true });
            }).toThrow('CSV must contain a header row and at least one data row.');
        });

        test('throws error if file does not exist', () => {
            expect(() => {
                new CsvReplayer('/non/existent/path.csv');
            }).toThrow('CSV file not found');
        });
    });
});
