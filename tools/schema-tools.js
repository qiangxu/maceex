const fs = require('fs');
const csvParse = require('csv-parse/lib/sync');

function parseCsvSchema(csvPath) {
    const content = fs.readFileSync(csvPath);
    const records = csvParse(content, { columns: true });

    return records.map(row => {
        let type;
        if (row['FIELD_TYPE'].startsWith('varchar')) {
            type = 'string';
        } else if (row['FIELD_TYPE'].startsWith('decimal')) {
            type = 'uint256';
        } else {
            throw new Error(`UNKNOWN FIELD_TYPE: ${row['FIELD_TYPE']}`);
        }
        return {
            name: row['FIELD_NAME'],
            type,
            precision: row['FIELD_TYPE'].startsWith('decimal') ? parseInt(row['FIELD_TYPE'].match(/\d+,\s*(\d+)/)[1]) : null
        };
    });
}

function generateSchemaDefinition(schemaFields) {
    return schemaFields.map(f => `${f.type} ${f.name}`).join(', ');
}

function encodeData(schemaFields, rawData) {
    return schemaFields.map(f => {
        let value = rawData[f.name];
        if (f.type === 'uint256' && f.precision) {
            value = (parseFloat(value) * Math.pow(10, f.precision)).toFixed(0);
        }
        return {
            name: f.name,
            value,
            type: f.type
        };
    });
}

