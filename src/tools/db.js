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
          record_id       TEXT NOT NULL PRIMARY KEY,
          batch_id        TEXT NOT NULL,
          merkle_root     TEXT NOT NULL,
          proofs_cid      TEXT,
          attestation_uid TEXT,
          created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_attest_batch ON attestations(batch_id);
  `);
    return db;
}

export async function isProcessed(db, recordId) {
    const row = await db.get(
        'SELECT 1 FROM attestations WHERE record_id = ?',
        [recordId]
    );
    return !!row;
}

export async function getAllAttestedRecordIds(db) {
    const rows = await db.all('SELECT record_id FROM attestations');
    return rows.map(r => r.record_id);
}

export async function insertBatch(db, { batch_id, merkle_root, proofs_cid, attestation_uid, record_ids }) {
  await db.exec('BEGIN');
  try {
    const stmt = await db.prepare(`
      INSERT OR IGNORE INTO attestations (batch_id, record_id, merkle_root, proofs_cid, attestation_uid)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const rid of record_ids) {
      await stmt.run(batch_id, rid, merkle_root, proofs_cid, attestation_uid);
    }
    await stmt.finalize();
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}
