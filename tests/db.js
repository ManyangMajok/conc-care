import { randomBytes } from "node:crypto";
import {
  openDatabase as connect,
  databaseConfig,
  migrate,
} from "../server/db.js";
export { migrate };
export async function openDatabase() {
  if (!process.env.TEST_DB_USER || !process.env.TEST_DB_PASSWORD)
    throw new Error("Load .env.test with isolated MySQL test credentials.");
  const config = databaseConfig({
    ...process.env,
    DB_NAME: "mysql",
    DB_USER: process.env.TEST_DB_USER,
    DB_PASSWORD: process.env.TEST_DB_PASSWORD,
  });
  const admin = await connect(config),
    name = "ccg_test_" + randomBytes(8).toString("hex");
  await admin.exec(
    `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
  );
  const db = await connect({ ...config, database: name });
  const close = db.close;
  let closed = false;
  db.reconnect = async () => {
    await close();
    closed = true;
    return connect({ ...config, database: name });
  };
  db.close = async () => {
    if (!closed) await close();
    closed = true;
    await admin.exec(`DROP DATABASE \`${name}\``);
    await admin.close();
  };
  return db;
}
