import Database from 'better-sqlite3';
import fs from 'fs';
import type { OpMsgPayload } from "@chikkadb/interfaces/wire/types";

function openDb(dbName: string, dbPath: string): Database.Database {
  return new Database(`${dbPath}/${dbName}.sqlite`);
}

export function getCollStatsResponse(dbName: string, collName: string, dbPath: string): OpMsgPayload {
  const db = openDb(dbName, dbPath);

  try {
    const row = db.prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(LENGTH(doc)), 0) as size FROM "${collName}"`
    ).get() as { count: number; size: number };

    const avgObjSize = row.count > 0 ? row.size / row.count : 0;

    return {
      _type: 'OP_MSG',
      flagBits: 0,
      sections: [{
        sectionKind: 0 as const,
        document: {
          cursor: {
            firstBatch: [{
              capped: false,
              count: row.count,
              size: row.size,
              storageSize: row.size,
              totalIndexSize: 0,
              freeStorageSize: 0,
              avgObjSize,
              nindexes: 1,
            }],
            id: 0n,
            ns: `${dbName}.${collName}`,
          },
          ok: 1,
        },
      }],
    };
  } finally {
    db.close();
  }
}

export function getDbStatsResponse(dbName: string, dbPath: string): OpMsgPayload {
  const dbFile = `${dbPath}/${dbName}.sqlite`;
  let dataSize = 0;
  let collections = 0;

  if (fs.existsSync(dbFile)) {
    dataSize = fs.statSync(dbFile).size;
    const db = new Database(dbFile);
    try {
      const row = db.prepare(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table'`
      ).get() as { count: number };
      collections = row.count;
    } finally {
      db.close();
    }
  }

  return {
    _type: 'OP_MSG',
    flagBits: 0,
    sections: [{
      sectionKind: 0 as const,
      document: {
        db: dbName,
        collections,
        dataSize,
        storageSize: dataSize,
        indexes: collections,
        indexSize: 0,
        totalSize: dataSize,
        ok: 1,
      },
    }],
  };
}
