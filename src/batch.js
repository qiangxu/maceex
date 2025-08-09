import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import keccak256 from 'keccak256';
import { MerkleTree } from 'merkletreejs';
import { fileURLToPath } from 'url';

import { readNdjson } from './tools/ndjson.js';
import {
  openDB, getAllAttestedRecordIds,
  upsertBatchHeader, insertBatchRecords,
  markBatchSent, markBatchConfirmed, markBatchFailed,
  getBatchHeader, listPendingBatchHeaders
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

// —— 宕机恢复：扫描 pending 批次头，依据 tx_hash 查询确认 —— //
async function recoverPendingBatches(db) {
  const pendings = await listPendingBatchHeaders(db);
  if (pendings.length === 0) return;

  console.log(`🩹 Recovering ${pendings.length} pending batch(es)...`);
  for (const p of pendings) {
    const { batch_id, tx_hash } = p;
    if (!tx_hash) {
      console.log(`ℹ️ Pending batch ${batch_id} has no tx_hash yet, will be handled by next run when re-sent.`);
      continue;
    }
    try {
      const receipt = await getReceipt(tx_hash);
      if (receipt && receipt.status === 1) {
        // EAS SDK的 uid 无法从 receipt 直接拿，这里建议你在首次发送时就保存 uid。
        // 若宕机导致 uid 丢失，可后续补做“事件回溯”来找 uid（需要 EAS ABI）。
        // 这里暂时把 uid 标注为 'unknown:recovered'，或留空待后续补全。
        await markBatchConfirmed(db, { batch_id, attestation_uid: 'unknown:recovered' });
        console.log(`✅ Recovered confirmed: batch ${batch_id} (tx=${tx_hash})`);
      } else {
        console.log(`⌛ Batch ${batch_id} not confirmed yet (tx=${tx_hash}).`);
      }
    } catch (e) {
      console.log(`⚠️ Recover check failed for batch ${batch_id}:`, e.message);
    }
  }
}

async function main() {
  const db = await openDB(APP_STATE);

  // 0) 启动先做一次恢复
  await recoverPendingBatches(db);

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
    batch_id: bid, root, count: newRecords.length, createdAt: new Date().toISOString()
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
  await upsertBatchHeader(db, { batch_id: bid, merkle_root: root, proofs_cid: proofsPath });
  await insertBatchRecords(db, {
    batch_id: bid, merkle_root: root, proofs_cid: proofsPath,
    record_ids: newRecords.map(r => r.RECORD_ID)
  });

  // 4) 发送前可做“链上探测”避免重复（如需事件回溯可让我加）
  //    当前先直接发送，拿到 txHash/uid 以便恢复
  try {
    const { uid, txHash } = await attestMerkleBatch({
      merkle_root: root,
      batch_id: bid,
      count: newRecords.length,
      proofs_pointer: proofsPath   // 先用本地路径，后续可切换 IPFS
    });

    // 发送后立刻写 tx_hash（为恢复准备）
    await markBatchSent(db, { batch_id: bid, tx_hash: txHash });

    // 等待确认后回填 uid 并标记 confirmed（attestMerkleBatch 已经 wait 过一次）
    await markBatchConfirmed(db, { batch_id: bid, attestation_uid: uid });

    console.log(`✅ Batch ${bid} confirmed. UID=${uid}, tx=${txHash}`);
  } catch (e) {
    await markBatchFailed(db, { batch_id: bid, error: e.message || String(e) });
    console.error(`❌ Batch ${bid} failed to attest:`, e);
  }
}

main().catch(e => {
  console.error('❌ run-batch failed:', e);
  process.exit(1);
});

