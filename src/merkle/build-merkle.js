import 'dotenv/config';
import keccak256 from 'keccak256';
import { MerkleTree } from 'merkletreejs';
import fs from 'fs';
import { readNdjson } from '../tools/ndjson.js';
import { openDB, getAllAttestedRecordIds } from '../tools/db.js';

const DIR_MERKLE = process.env.DIR_MERKLE;
async function main() {
	const db = await openDB(process.env.STATE_FILE);
	const allRecords = await readNdjson(process.env.INPUT_RECORDS);
	const attestedIds = await getAllAttestedRecordIds(db);

	const records = allRecords.filter(r => attestedIds.includes(r.RECORD_ID)).slice(0, 2);

	const leaves = records.map((r) => {
        console.log(r);
		return keccak256(Buffer.from(JSON.stringify(r)));
	});
    console.log("LEAF1:", leaves[0])
    console.log("LEAF2:", leaves[1])
	const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
	const merkleRoot = tree.getHexRoot();

	console.log(`🌲 Merkle Root: ${merkleRoot}`);

	const result = [];

	for (let i = 0; i < records.length; i++) {
		const json = JSON.stringify(records[i]);
		const hash = keccak256(Buffer.from(json));
		const proof = tree.getHexProof(hash);

		result.push({
			record_id: records[i].RECORD_ID,
			order: records[i],
			proof,
		});
	}

	if (!fs.existsSync(DIR_MERKLE)) fs.mkdirSync(DIR_MERKLE, { recursive: true });

	const outputPath = `${DIR_MERKLE}/merkle-${new Date().toISOString().split('T')[0]}.json`;
	fs.writeFileSync(outputPath, JSON.stringify({ root: merkleRoot, data: result }, null, 2));

	console.log(`✅ Merkle data saved to ${outputPath}`);
}

main().catch(console.error);
