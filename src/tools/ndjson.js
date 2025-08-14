// src/utils/ndjson.js
import fs from "fs";
import readline from "readline";

export async function readNdjson(filePath) {
  const results = [];

  const fileStream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim() !== "") {
      try {
        results.push(JSON.parse(line));
      } catch (err) {
        console.warn(`❌ Skipping invalid JSON line: ${line}`);
        return [];
      }
    }
  }

  return results;
}
