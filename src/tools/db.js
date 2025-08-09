// src/db.js
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
      RECORD_ID TEXT PRIMARY KEY,
      UID TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    return db;
}

export async function isProcessed(db, recordId) {
    const row = await db.get(
        'SELECT 1 FROM attestations WHERE RECORD_ID = ?',
        [recordId]
    );
    return !!row;
}

export async function saveResult(db, recordId, uid) {
    await db.run(
        'INSERT INTO attestations (RECORD_ID, UID) VALUES (?, ?)',
        [recordId, uid]
    );
}

export async function getAllAttestedRecordIds(db) {
  const rows = await db.all('SELECT RECORD_ID FROM attestations');
  return rows.map(r => r.RECORD_ID);
}
