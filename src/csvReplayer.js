const fs = require('fs');

/**
 * Parses a CSV line respecting quoted values.
 * e.g. '12,"hello, world",34.5' -> ['12', 'hello, world', '34.5']
 */
function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"' || char === "'") {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());

    return values.map((val) => val.replace(/^["']|["']$/g, ''));
}

/**
 * Casts a string value to appropriate JavaScript type (Number, Boolean, JSON, String).
 */
function castValue(raw) {
    if (raw === undefined || raw === null || raw === '') return '';

    const lower = raw.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (lower === 'null') return null;

    if (!isNaN(raw) && !isNaN(parseFloat(raw))) {
        return Number(raw);
    }

    if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    }

    return raw;
}

class CsvReplayer {
    constructor(filePathOrContent, options = {}) {
        this.options = {
            loop: true,
            injectTimestamp: true,
            ...options
        };

        this.rows = [];
        this.cursors = new Map();

        let content;
        if (options.isContent) {
            content = filePathOrContent;
        } else {
            if (!fs.existsSync(filePathOrContent)) {
                throw new Error(`CSV file not found: ${filePathOrContent}`);
            }
            content = fs.readFileSync(filePathOrContent, 'utf-8');
        }

        this.parse(content);
    }

    parse(content) {
        const lines = content
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith('#'));

        if (lines.length < 2) {
            throw new Error('CSV must contain a header row and at least one data row.');
        }

        const headers = parseCsvLine(lines[0]);

        for (let i = 1; i < lines.length; i++) {
            const rawValues = parseCsvLine(lines[i]);
            const row = {};

            headers.forEach((header, index) => {
                row[header] = castValue(rawValues[index]);
            });

            this.rows.push(row);
        }
    }

    getRowCount() {
        return this.rows.length;
    }

    hasMoreRows(devId = 'default') {
        const cursor = this.cursors.get(devId) || 0;
        return cursor < this.rows.length;
    }

    getNextRow(devId = 'default') {
        if (this.rows.length === 0) return null;

        let cursor = this.cursors.get(devId) || 0;

        if (cursor >= this.rows.length) {
            if (this.options.loop) {
                cursor = 0;
            } else {
                return null;
            }
        }

        const baseRow = this.rows[cursor];
        const row = { ...baseRow };

        this.cursors.set(devId, cursor + 1);

        if (!row.deviceId) {
            row.deviceId = devId;
        }

        if (this.options.injectTimestamp && !row.timestamp) {
            row.timestamp = new Date().toISOString();
        }

        return row;
    }

    getNextPayload(devId = 'default') {
        const row = this.getNextRow(devId);
        return row ? JSON.stringify(row) : null;
    }

    reset(devId) {
        if (devId) {
            this.cursors.delete(devId);
        } else {
            this.cursors.clear();
        }
    }
}

module.exports = {
    CsvReplayer,
    parseCsvLine,
    castValue
};
