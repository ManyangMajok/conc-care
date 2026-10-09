import mysql from "mysql2/promise";
import { AsyncLocalStorage } from "node:async_hooks";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
export function databaseConfig(env = process.env) {
  if (!env.DB_NAME || !env.DB_USER || !env.DB_PASSWORD)
    throw new Error(
      "Set DB_NAME, DB_USER and DB_PASSWORD before connecting to MySQL.",
    );
  if (!/^[a-zA-Z0-9_]+$/.test(env.DB_NAME)) throw new Error("Invalid DB_NAME.");
  const ssl =
    env.DB_SSL === "true"
      ? {
          rejectUnauthorized: true,
          ...(env.DB_SSL_CA ? { ca: readFileSync(env.DB_SSL_CA) } : {}),
        }
      : undefined;
  return {
    host: env.DB_HOST || "127.0.0.1",
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    connectionLimit: Number(env.DB_POOL_SIZE || 10),
    waitForConnections: true,
    queueLimit: 100,
    connectTimeout: 10000,
    multipleStatements: false,
  };
}
export async function openDatabase(config = databaseConfig()) {
  const pool = mysql.createPool(config),
    context = new AsyncLocalStorage();
  try {
    const c = await pool.getConnection();
    try {
      await c.query("SELECT 1");
    } finally {
      c.release();
    }
  } catch (e) {
    await pool.end();
    throw e;
  }
  const db = {
    pool,
    context,
    async query(sql, params = []) {
      const current = context.getStore(),
        conn = current || (await pool.getConnection());
      try {
        if (!current) await conn.query("SET time_zone = '+00:00'");
        const [result] = await conn.query({
          sql,
          values: params,
          timeout: 30000,
        });
        return result;
      } catch (error) {
        // Driver errors can include SQL containing passwords or personal data.
        delete error.sql;
        throw error;
      } finally {
        if (!current) conn.release();
      }
    },
    prepare(sql) {
      return {
        get: async (...args) => (await db.query(sql, args))[0],
        all: async (...args) => db.query(sql, args),
        run: async (...args) => {
          const r = await db.query(sql, args);
          return { lastInsertRowid: r.insertId, changes: r.affectedRows };
        },
      };
    },
    exec: async (sql) => db.query(sql),
    close: async () => pool.end(),
  };
  return db;
}
export async function transaction(db, fn) {
  if (db.context.getStore())
    throw new Error("Nested transactions are not supported.");
  const conn = await db.pool.getConnection();
  try {
    await conn.query("SET time_zone = '+00:00'");
    await conn.beginTransaction();
    // Serialize CRM writes across instances to preserve relationship and version checks.
    await conn.query("SELECT id FROM crm_write_lock WHERE id=1 FOR UPDATE");
    const result = await db.context.run(conn, fn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
export async function migrate(db) {
  const conn = await db.pool.getConnection();
  const lock = `ccg_migrate_${createHash("sha256").update(db.pool.pool.config.connectionConfig.database).digest("hex").slice(0, 48)}`;
  try {
    const [rows] = await conn.query("SELECT GET_LOCK(?,30) acquired", [lock]);
    if (rows[0].acquired !== 1)
      throw new Error("Another migration is running.");
    await conn.query(
      "CREATE TABLE IF NOT EXISTS migrations (name VARCHAR(200) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
    );
    const folder = fileURLToPath(
      new URL("../migrations/mysql/", import.meta.url),
    );
    for (const name of readdirSync(folder)
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const source = readFileSync(folder + name, "utf8"),
        checksum = createHash("sha256").update(source).digest("hex");
      const [found] = await conn.query(
        "SELECT checksum FROM migrations WHERE name=?",
        [name],
      );
      if (found.length) {
        if (found[0].checksum !== checksum)
          throw new Error(`Migration changed: ${name}`);
        continue;
      }
      // MySQL DDL auto-commits. Never mark a partially applied file successful.
      for (const statement of source
        .split(/;\s*\n-- statement\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean))
        await conn.query(statement.replace(/;\s*$/, ""));
      await conn.query("INSERT INTO migrations(name,checksum) VALUES (?,?)", [
        name,
        checksum,
      ]);
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK(?)", [lock]);
    conn.release();
  }
}
