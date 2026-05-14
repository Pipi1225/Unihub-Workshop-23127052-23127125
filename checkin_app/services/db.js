import * as SQLite from "expo-sqlite/legacy";

const db = SQLite.openDatabase("checkin.db");

export function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        sql,
        params,
        (_, result) => resolve(result),
        (_, error) => {
          reject(error);
          return false;
        }
      );
    });
  });
}

export async function initDb() {
  await runSql(
    "CREATE TABLE IF NOT EXISTS local_registrations (registration_id TEXT PRIMARY KEY NOT NULL, qr_code_hash TEXT UNIQUE, workshop_id TEXT, full_name TEXT, checkin_status INTEGER DEFAULT 0, checkin_time TEXT, sync_status TEXT DEFAULT 'SYNCED')"
  );
  await runSql("CREATE INDEX IF NOT EXISTS idx_local_qr_hash ON local_registrations (qr_code_hash)");
  await runSql("CREATE INDEX IF NOT EXISTS idx_local_workshop_qr ON local_registrations (workshop_id, qr_code_hash)");
  await runSql("CREATE INDEX IF NOT EXISTS idx_local_sync_status ON local_registrations (sync_status)");

  const migrations = [
    "ALTER TABLE local_registrations ADD COLUMN workshop_id TEXT",
    "ALTER TABLE local_registrations ADD COLUMN full_name TEXT",
  ];

  for (const migration of migrations) {
    try {
      await runSql(migration);
    } catch (error) {
      // Ignore if column already exists
    }
  }
}
