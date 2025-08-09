// src/watcher.js
import 'dotenv/config';
import chokidar from 'chokidar';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDB, isProcessed, saveResult } from './db.js';
import { attestRecord } from './eas.js';
import { setTimeout as sleep } from 'node:timers/promises';

const INPUT_FILE = process.env.INPUT_FILE
console.log(`👀 Monitoring: ${INPUT_FILE}`);
const db = await openDB(process.env.DB_STATE);

async function processFile(filePath) {
	const rl = readline.createInterface({
		input: fs.createReadStream(filePath),
		crlfDelay: Infinity
	});

	for await (const line of rl) {
		if (!line.trim()) continue;

		try {
			const record = JSON.parse(line);
			const recordId = record.RECORD_ID;

			if (await isProcessed(db, recordId)) {
				console.log(`⏩ Skipped RECORD_ID ${recordId}, already processed.`);
				continue;
			}

			const tx = await attestRecord(record);
			let uid = await tx.wait();
			console.log(`✅ RECORD_ID ${recordId} attested. UID: ${uid}`);

			await saveResult(db, recordId, uid);
		} catch (err) {
			console.error('❌ Error processing line:', err);
		}
		await sleep(3000); // sleep 3 秒	
	}
}

await processFile(INPUT_FILE);
//chokidar.watch(INPUT_FILE).on('change', async () => {
//	console.log('📂 File changed, processing...');
//	await processFile(INPUT_FILE);
//});
