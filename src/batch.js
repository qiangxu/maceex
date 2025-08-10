import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import keccak256 from 'keccak256';
import { MerkleTree } from 'merkletreejs';
import { fileURLToPath } from 'url';

import { readNdjson } from './tools/ndjson.js';
import {
	openDB, withTransaction, getAllAttestedRecordIds,
	upsertBatchHeader, insertBatchRecords,
	listRetryableBatchHeaders, markBatchSent, markBatchConfirmed, markBatchFailed,
	getBatchHeader, listPendingBatchHeaders, listUnconfirmedBatchHeaders, 
	countBatchMembers
} from './tools/db.js';

import { attestMerkleBatch, getReceipt } from './eas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DIR_INPUT_RECORDS = process.env.DIR_INPUT_RECORDS;
const DIR_MERKLE        = process.env.DIR_MERKLE;
const APP_STATE         = process.env.APP_STATE;

const toHex = (buf) => '0x' + Buffer.from(buf).toString('hex');
const leafFromRecord = (rec) => keccak256(Buffer.from(JSON.stringify(rec)));
const batchIdNow = () => new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');

async function readAllRecords(dir) {
	if (!fs.existsSync(dir)) return [];
	const files = fs.readdirSync(dir).filter(f => f.endsWith('.ndjson'));
	const out = [];
	for (const f of files) {
		const arr = await readNdjson(path.resolve(dir, f));
		out.push(...arr);
	}
	// 去重
	const seen = new Set(); const uniq = [];
	for (const r of out) {
		if (!r?.RECORD_ID) continue;
		if (seen.has(r.RECORD_ID)) continue;
		seen.add(r.RECORD_ID);
		uniq.push(r);
	}
	return uniq;
}

// batch.js 启动时先恢复
async function recoverBatches(db) {
  const nowISO = new Date().toISOString();
  const heads = await listRetryableBatchHeaders(db, { nowISO, minDelaySec: 30 });

  for (const h of heads) {
    const { batch_id, tx_hash, merkle_root, proofs_cid } = h;

    // 1) 有 tx_hash：先查链
    if (tx_hash) {
      try {
        const rcpt = await getReceipt(tx_hash);
        if (rcpt && rcpt.status === 1) {
          await markBatchConfirmed(db, { batch_id, attestation_uid: 'unknown:recovered' });
          console.log(`✅ recovered confirmed: ${batch_id}`);
          continue;
        }
        console.log(`⏳ still pending: ${batch_id}`);
        continue; // 下一轮再查
      } catch (e) {
        console.log(`⚠️ receipt check error for ${batch_id}: ${e.message}`);
        // 不改变状态，等下轮
        continue;
      }
    }

    // 2) 没有 tx_hash：重发同一批次
    try {
      const count = await countBatchMembers(db, batch_id);
      const { uid, txHash } = await attestMerkleBatch({
        merkle_root, batch_id, count, proofs_pointer: proofs_cid
      });
      await markBatchSent(db, { batch_id, tx_hash: txHash });         // 会写 last_attempt_at + retry_count+=1
      await markBatchConfirmed(db, { batch_id, attestation_uid: uid });
      console.log(`🔁 re-attested ${batch_id} uid=${uid}`);
    } catch (e) {
      await markBatchFailed(db, { batch_id, error: e.message });
      console.log(`❌ re-attest failed ${batch_id}: ${e.message}`);
    }
  }
}


async function main() {
	const db = await openDB(APP_STATE);

	// 0) 启动先做一次恢复
	await recoverBatches(db);

	// 1) 读取全部文件，过滤已 attested 的 record
	const all = await readAllRecords(DIR_INPUT_RECORDS);
	const attested = new Set(await getAllAttestedRecordIds(db));
	const newRecords = all.filter(r => !attested.has(r.RECORD_ID));

	if (newRecords.length === 0) {
		console.log('✅ No new records to batch.');
		return;
	}

	// 2) 生成批次
	const bid    = batchIdNow();
	const leaves = newRecords.map(leafFromRecord);
	const tree   = new MerkleTree(leaves, keccak256, { sortPairs: true });
	const root   = tree.getHexRoot();

	if (!fs.existsSync(DIR_MERKLE)) fs.mkdirSync(DIR_MERKLE, { recursive: true });
	const rootPath   = path.join(DIR_MERKLE, `root-${bid}.json`);
	const proofsPath = path.join(DIR_MERKLE, `proofs-${bid}.ndjson`);

	fs.writeFileSync(rootPath, JSON.stringify({
		batch_id: bid, root, count: newRecords.length, created_at: new Date().toISOString()
	}, null, 2));

	const proofsLines = newRecords.map((rec, i) => {
		const leaf = leaves[i];
		const proof = tree.getHexProof(leaf);
		return JSON.stringify({ record_id: rec.RECORD_ID, leaf: toHex(leaf), proof });
	}).join('\n') + '\n';
	fs.writeFileSync(proofsPath, proofsLines, 'utf-8');

	console.log(`🧺 New batch ${bid} | root=${root} | count=${newRecords.length}`);
	console.log(`📄 root:   ${rootPath}`);
	console.log(`📄 proofs: ${proofsPath}`);

	// 3) 入库：先写批次头 + 订单（pending）
	await withTransaction(db, async () => {
		await upsertBatchHeader(db, { batch_id: bid, merkle_root: root, proofs_cid: proofsPath });
		await insertBatchRecords(db, {
			batch_id: bid,
			merkle_root: root,
			proofs_cid: proofsPath,
			record_ids: newRecords.map(r => r.RECORD_ID)
		});
	});


	// 4) 发送前可做“链上探测”避免重复（如需事件回溯可让我加）
	//    当前先直接发送，拿到 txHash/uid 以便恢复
	const { uid, txHash } = await attestMerkleBatch({
		merkle_root: root,
		batch_id: bid,
		count: newRecords.length,
		proofs_pointer: proofsPath   // 先用本地路径，后续可切换 IPFS
	});
	
	console.log( { uid, txHash } );
	// 发送后立刻写 tx_hash（为恢复准备）
	await markBatchSent(db, { batch_id: bid, tx_hash: txHash });

	await markBatchConfirmed(db, { batch_id: bid, attestation_uid: uid, tx_hash: txHash});

	console.log(`✅ Batch ${bid} confirmed. UID=${uid}, tx=${txHash}`);
}

main().catch(e => {
	console.error('❌ run-batch failed:', e);
	process.exit(1);
});

