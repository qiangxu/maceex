// src/tools/db.js
import 'dotenv/config';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

export async function openDB(dbFile) {

	const db = await open({
		filename: dbFile,
		driver: sqlite3.Database
	});
	await db.exec(`
		CREATE TABLE IF NOT EXISTS attestations (
		  batch_id        TEXT NOT NULL,
		  record_id       TEXT NOT NULL PRIMARY KEY,   -- 订单主键；批次头用 __BATCH__:<batch_id>
		  merkle_root     TEXT,                        -- 批次头/订单都写，便于回查
		  proofs_cid      TEXT,                        -- 本地路径或 IPFS CID
		  attestation_uid TEXT,                        -- 成功后回填：整批共享
		  tx_hash         TEXT,                        -- 发送后立刻写入，便于恢复
		  status          TEXT CHECK(status IN ('pending','confirmed','failed')) DEFAULT 'pending',
		  error           TEXT,                        -- 出错信息留档
		  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_attest_batch ON attestations(batch_id);
    `);
	return db;
}

export async function isProcessed(db, recordId) {
	const rows = await db.all(`SELECT record_id FROM attestations WHERE record_id NOT LIKE '__BATCH__:%'`);
	return rows.map(r => r.record_id);
}

export const batchHeaderId = (batchId) => `__BATCH__:${batchId}`;

export async function upsertBatchHeader(db, { batch_id, merkle_root, proofs_cid }) {
  const rid = batchHeaderId(batch_id);
  await db.run(
    `INSERT INTO attestations (batch_id, record_id, merkle_root, proofs_cid, status)
     VALUES (?, ?, ?, ?, 'pending')
     ON CONFLICT(record_id) DO UPDATE SET
       merkle_root=excluded.merkle_root,
       proofs_cid=excluded.proofs_cid`,
    [batch_id, rid, merkle_root, proofs_cid]
  );
}
export async function markBatchSent(db, { batch_id, tx_hash }) {
  const rid = batchHeaderId(batch_id);
  await db.run(
    `UPDATE attestations SET tx_hash=?, status='pending', error=NULL WHERE record_id=?`,
    [tx_hash, rid]
  );
}
export async function markBatchConfirmed(db, { batch_id, attestation_uid }) {
  const rid = batchHeaderId(batch_id);
  await db.run(
    `UPDATE attestations SET attestation_uid=?, status='confirmed', error=NULL WHERE record_id=?`,
    [attestation_uid, rid]
  );
  // 同步该批所有订单的 uid/status
  await db.run(
    `UPDATE attestations SET attestation_uid=?, status='confirmed' WHERE batch_id=? AND record_id <> ?`,
    [attestation_uid, batch_id, rid]
  );
}
export async function markBatchFailed(db, { batch_id, error }) {
  const rid = batchHeaderId(batch_id);
  await db.run(
    `UPDATE attestations SET status='failed', error=? WHERE record_id=?`,
    [String(error).slice(0, 2000), rid]
  );
}
export async function getBatchHeader(db, batch_id) {
  const rid = batchHeaderId(batch_id);
  return db.get(`SELECT * FROM attestations WHERE record_id=?`, [rid]);
}


export async function getAllAttestedRecordIds(db) {
	const rows = await db.all('SELECT record_id FROM attestations');
	return rows.map(r => r.record_id);
}

export async function insertBatchRecords(db, { batch_id, merkle_root, proofs_cid, record_ids }) {
  await db.exec('BEGIN');
  try {
    const stmt = await db.prepare(`
      INSERT OR IGNORE INTO attestations (batch_id, record_id, merkle_root, proofs_cid, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);
    for (const rid of record_ids) {
      await stmt.run(batch_id, rid, merkle_root, proofs_cid);
    }
    await stmt.finalize();
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

// 找出所有处于 pending 的批次头，供启动恢复
export async function listPendingBatchHeaders(db) {
  return db.all(
    `SELECT * FROM attestations
      WHERE record_id LIKE '__BATCH__:%' AND status='pending'`
  );
}
