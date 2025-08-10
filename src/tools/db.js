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
          last_attempt_at TEXT,                        -- 
          retry_count     INTEGER DEFAULT 0,
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

export async function withTransaction(db, fn, name='tx') {
  await db.exec(`SAVEPOINT ${name}`);
  try {
    const res = await fn();
    await db.exec(`RELEASE ${name}`);
    return res;
  } catch (e) {
    await db.exec(`ROLLBACK TO ${name}`);
    throw e;
  }
}

export const batchHeaderId = (batchId) => `__BATCH__:${batchId}`;

export async function upsertBatchHeader(db, { batch_id, merkle_root, proofs_cid }) {
  const headerId = batchHeaderId(batch_id); // 仅此处使用
  await db.run(`
    INSERT INTO attestations (batch_id, record_id, merkle_root, proofs_cid, status)
    VALUES (?, ?, ?, ?, 'pending')
    ON CONFLICT(record_id) DO UPDATE SET
      merkle_root = excluded.merkle_root,
      proofs_cid  = excluded.proofs_cid
    WHERE status='pending'
  `, [batch_id, headerId, merkle_root, proofs_cid]);

}

export async function markBatchSent(db, { batch_id, tx_hash }) {
  const rid = `__BATCH__:${batch_id}`;
  await db.run(
    `UPDATE attestations
        SET tx_hash=?, status='pending', error=NULL,
            last_attempt_at=?, retry_count=COALESCE(retry_count,0)+1
      WHERE record_id=?`,
    [tx_hash, new Date().toISOString(), rid]
  );
}

export async function markBatchFailed(db, { batch_id, error }) {
  const rid = `__BATCH__:${batch_id}`;
  await db.run(
    `UPDATE attestations
        SET status='failed', error=?, last_attempt_at=? 
      WHERE record_id=?`,
    [String(error).slice(0,2000), new Date().toISOString(), rid]
  );
}
export async function markBatchConfirmed(db, { batch_id, attestation_uid, tx_hash }) {
  const rid = `__BATCH__:${batch_id}`;

  // 子记录写 uid + 置 confirmed
  await db.run(
    `UPDATE attestations
        SET attestation_uid=?, tx_hash=?, status='confirmed'
      WHERE batch_id=? AND record_id <> ?`,
    [attestation_uid, tx_hash, batch_id, rid]
  );

  // 头记录删除（可选改为软删除）
  await db.run(
    `DELETE FROM attestations WHERE record_id=?`,
    [rid]
  );
}
export async function getBatchHeader(db, batch_id) {
    const rid = batchHeaderId(batch_id);
    return db.get(`SELECT * FROM attestations WHERE record_id=?`, [rid]);
}


export async function getAllAttestedRecordIds(db) {
    const rows = await db.all(`
    SELECT record_id FROM attestations
    WHERE record_id NOT LIKE '__BATCH__:%' AND status='confirmed'
    `);
    return rows.map(r => r.record_id);
}
export async function insertBatchRecords(db, { batch_id, merkle_root, proofs_cid, record_ids }) {
  const stmt = await db.prepare(`
    INSERT INTO attestations (batch_id, record_id, merkle_root, proofs_cid, status)
    VALUES (?, ?, ?, ?, 'pending')
    ON CONFLICT(record_id) DO UPDATE SET
      batch_id    = excluded.batch_id,
      merkle_root = excluded.merkle_root,
      proofs_cid  = excluded.proofs_cid,
      status      = 'pending',
      error       = NULL
  `);
  try {
    for (const rid of record_ids) {
      await stmt.run(batch_id, rid, merkle_root, proofs_cid);
    }
  } finally {
    await stmt.finalize();
  }
}


// 找出所有处于 pending 的批次头，供启动恢复
export async function listPendingBatchHeaders(db) {
    return db.all(`
      SELECT * FROM attestations
      WHERE record_id LIKE '__BATCH__:%' AND status='pending'`
    );
}
export async function listUnconfirmedBatchHeaders(db) {
  return db.all(`
    SELECT * FROM attestations
    WHERE record_id LIKE '__BATCH__:%' AND status IN ('pending','failed')
  `);
}
export async function countBatchMembers(db, batch_id) {
  const r = await db.get(`
    SELECT COUNT(*) AS c FROM attestations
    WHERE batch_id=? AND record_id NOT LIKE '__BATCH__:%'`, [batch_id]);
  return r.c || 0;
}

export async function listRetryableBatchHeaders(db, { nowISO, minDelaySec = 30 }) {
	// 允许重试：status in (pending, failed) 且 (last_attempt_at 为空或 距今>=minDelaySec)
	return db.all(`
	SELECT * FROM attestations
	 WHERE record_id LIKE '__BATCH__:%'
	   AND status IN ('pending','failed')
	   AND (last_attempt_at IS NULL OR (julianday(?) - julianday(last_attempt_at)) * 86400 >= ?)
  `, [nowISO, minDelaySec]);
}
