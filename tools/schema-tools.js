// tools/schema-tools.js
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

/**
 * 1. 解析 CSV 文件生成字段结构（用于 schema 注册 + encodeData）
 */
export function parseCsvSchema(csvPath) {
  const content = fs.readFileSync(csvPath);
  const records = parse(content, { columns: true });

  return records.map((row) => {
    const rawType = row["FIELD_TYPE"];
    const name = row["FIELD_NAME"];

    let type;
    let precision = null;

    if (rawType.startsWith("varchar")) {
      type = "string";
    } else if (rawType.startsWith("decimal")) {
      type = "uint256";
      const match = rawType.match(/decimal\(\d+,\s*(\d+)\)/);
      if (match) {
        precision = parseInt(match[1]);
      }
    } else {
      throw new Error(`UNKNOWN FIELD_TYPE: ${rawType}`);
    }

    return { name, type, precision };
  });
}

/**
 * 2. 生成 EAS Schema 字符串
 */
export function generateSchemaDefinition(fields) {
  return fields.map((f) => `${f.type} ${f.name}`).join(", ");
}

/**
 * 3. 将一笔订单数据按 schema 结构 encode
 */
export function encodeDataFromSchema(fields, rowData) {
  return fields.map((f) => {
    let value = rowData[f.name];

    if (f.type === "uint256" && f.precision !== null) {
      value = (parseFloat(value) * Math.pow(10, f.precision)).toFixed(0);
    }

    return {
      name: f.name,
      value,
      type: f.type,
    };
  });
}

