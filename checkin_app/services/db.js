import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("checkin.db");

function isSelectQuery(sql) {
  return /^\s*(select|pragma|with)\b/i.test(sql);
}

function wrapRows(rows) {
  return {
    length: rows.length,
    item(index) {
      return rows[index] ?? null;
    },
  };
}

export function runSql(sql, params = []) {
  try {
    if (isSelectQuery(sql)) {
      const rows = db.getAllSync(sql, params);
      return Promise.resolve({
        rows: wrapRows(rows),
      });
    }

    const result = db.runSync(sql, params);
    return Promise.resolve({
      rowsAffected: result.changes,
      insertId: result.lastInsertRowId ?? null,
      rows: wrapRows([]),
    });
  } catch (error) {
    return Promise.reject(error);
  }
}

export function runSqlTransaction(executor) {
  return new Promise((resolve, reject) => {
    try {
      db.execSync("BEGIN");

      const exec = (sql, params = []) => {
        if (isSelectQuery(sql)) {
          return {
            rows: wrapRows(db.getAllSync(sql, params)),
          };
        }

        const result = db.runSync(sql, params);
        return {
          rowsAffected: result.changes,
          insertId: result.lastInsertRowId ?? null,
          rows: wrapRows([]),
        };
      };

      executor(exec);
      db.execSync("COMMIT");
      resolve();
    } catch (error) {
      try {
        db.execSync("ROLLBACK");
      } catch (_rollbackError) {
        // ignore rollback errors
      }
      reject(error);
    }
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
